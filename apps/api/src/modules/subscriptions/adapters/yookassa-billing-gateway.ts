import type { YooKassaCard, YooKassaClient, YooKassaCredentials } from '../../../shared/integrations/yookassa/client';
import type { BillingGateway, CardBinding, PeriodPayment } from '../ports/gateway';

/**
 * BillingGateway на ЮMoney/ЮKassa для подписок (арендодатель платит НАМ). Креды — НАШЕГО магазина.
 * Два сценария сбора карты (см. [[gateway]]):
 *  - bindCard: zero-amount привязка карты БЕЗ списания (POST /payment_methods) → payment_method.active;
 *  - checkoutPeriod: прямой платёж на стоимость плана (capture:true) + save_payment_method → payment.succeeded.
 * Оба возвращают redirect; подтверждение — вебхуком, статус сверяем re-fetch'ем.
 *
 * NB: zero-amount привязка (/payment_methods) и сохранение карты на успешном платеже сверить с
 * боевой ЮKassa (тестовый магазин): формы ответов и события выверены по докам v3.
 */
export type YooKassaBillingGatewayDeps = {
  readonly client: YooKassaClient;
  /** Креды НАШЕГО (платформенного) магазина ЮKassa. */
  readonly credentials: YooKassaCredentials;
};

/** Псевдо-отпечаток карты для дедупа триалов. Стабилен для физической карты (БИН+хвост+срок). */
const cardFingerprint = (card: YooKassaCard | null): string | null =>
  card && card.first6 && card.last4
    ? `${card.first6}${card.last4}${card.expiryYear ?? ''}${card.expiryMonth ?? ''}`
    : null;

export const createYooKassaBillingGateway = (deps: YooKassaBillingGatewayDeps): BillingGateway => ({
  bindCard: (intent) =>
    deps.client
      .createPaymentMethod(deps.credentials, { returnUrl: intent.returnUrl, idempotencyKey: intent.idempotencyKey })
      .map((pm) => ({ kind: 'redirect' as const, url: pm.confirmationUrl ?? '', externalId: pm.id }))
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),

  getCardBinding: (bindingId) =>
    deps.client
      .getPaymentMethod(deps.credentials, bindingId)
      .map(
        (pm): CardBinding => ({
          status: pm.status === 'active' ? 'active' : pm.status === 'pending' ? 'pending' : 'failed',
          cardFingerprint: cardFingerprint(pm.card),
          paymentMethodId: pm.status === 'active' ? pm.id : null,
        }),
      )
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),

  checkoutPeriod: (intent) =>
    deps.client
      .createPayment(deps.credentials, {
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        capture: true, // сразу списываем стоимость плана
        returnUrl: intent.returnUrl,
        description: 'Оплата подписки',
        savePaymentMethod: true, // карта сохранится для будущего автобиллинга
        metadata: { orgId: intent.orgId, planId: intent.planId, purpose: 'period_checkout' },
        idempotencyKey: intent.idempotencyKey,
      })
      .map((p) => ({ kind: 'redirect' as const, url: p.confirmationUrl ?? '', externalId: p.id }))
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),

  getPeriodPayment: (paymentId) =>
    deps.client
      .getPayment(deps.credentials, paymentId)
      .map(
        (p): PeriodPayment => ({
          status: p.status === 'succeeded' ? 'succeeded' : p.status === 'canceled' ? 'canceled' : 'pending',
          cardFingerprint: cardFingerprint(p.card),
          paymentMethodId: p.paymentMethodId,
        }),
      )
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),

  charge: (params) =>
    deps.client
      .createPayment(deps.credentials, {
        amountMinor: params.amountMinor,
        currency: params.currency,
        capture: true, // off-session по сохранённой карте
        description: params.description,
        paymentMethodId: params.methodRef,
        idempotencyKey: params.idempotencyKey,
      })
      // succeeded → оплачено; всё прочее (canceled/застряло) трактуем как отказ → триал лапсится.
      .map((payment) => ({ status: payment.status === 'succeeded' ? ('succeeded' as const) : ('declined' as const) }))
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),
});
