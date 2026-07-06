import type { YooKassaCard, YooKassaClient, YooKassaCredentials, YooKassaPaymentStatus } from '../../../shared/integrations/yookassa/client';
import type { BillingGateway, CardSetupStatus } from '../ports/gateway';

/**
 * BillingGateway на ЮMoney/ЮKassa для подписок (арендодатель платит НАМ).
 * Переиспользует общий протокол-клиент ([[yookassa-client]]); отличие от платежей броней —
 * креды НАШЕГО магазина (а не арендодателя) и сценарий привязки карты.
 *
 * require_card_first → верификация карты auth-hold'ом (capture:false) на малую сумму + сохранение
 * способа оплаты для будущего автобиллинга. Это НЕ charge+refund: при подтверждении холд снимется
 * (cancel в вебхук-хендлере), денег с клиента не уходит.
 *
 * NB: persist карты на двухстадийном (capture:false) платеже сверить с боевой ЮKassa. Если save
 * срабатывает только на succeeded — переключить на capture:true + немедленный refund (флаг ниже).
 */
export type YooKassaBillingGatewayDeps = {
  readonly client: YooKassaClient;
  /** Креды НАШЕГО (платформенного) магазина ЮKassa. */
  readonly credentials: YooKassaCredentials;
  /** Сумма проверочного холда в minor units (₽10 = 1000). */
  readonly verificationAmountMinor: number;
  readonly currency: string;
};

/** Псевдо-отпечаток карты для дедупа триалов. Стабилен для физической карты (БИН+хвост+срок). */
const cardFingerprint = (card: YooKassaCard | null): string | null =>
  card && card.first6 && card.last4
    ? `${card.first6}${card.last4}${card.expiryYear ?? ''}${card.expiryMonth ?? ''}`
    : null;

/** ЮKassa-статус холда → доменный статус привязки карты. */
const SETUP_STATUS: Readonly<Record<YooKassaPaymentStatus, CardSetupStatus>> = {
  pending: 'pending',
  waiting_for_capture: 'held', // карта подтверждена, деньги заморожены
  succeeded: 'held', // edge: вдруг сразу списалось — карта точно валидна
  canceled: 'failed',
};

export const createYooKassaBillingGateway = (deps: YooKassaBillingGatewayDeps): BillingGateway => ({
  setupPaymentMethod: (intent) =>
    deps.client
      .createPayment(deps.credentials, {
        amountMinor: deps.verificationAmountMinor,
        currency: deps.currency,
        capture: false, // auth-hold: замораживаем, не списываем
        returnUrl: intent.returnUrl,
        description: 'Проверочный холд для привязки карты',
        savePaymentMethod: true,
        metadata: { orgId: intent.orgId, planId: intent.planId, purpose: 'card_setup' },
        idempotencyKey: intent.idempotencyKey,
      })
      .map((payment) => ({ kind: 'redirect' as const, url: payment.confirmationUrl ?? '', externalId: payment.id }))
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),

  getSetupResult: (paymentId) =>
    deps.client
      .getPayment(deps.credentials, paymentId)
      .map((payment) => ({
        status: SETUP_STATUS[payment.status],
        cardFingerprint: cardFingerprint(payment.card),
        paymentMethodId: payment.paymentMethodId,
      }))
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),

  releaseHold: (paymentId, idempotencyKey) =>
    deps.client
      .cancelPayment(deps.credentials, paymentId, idempotencyKey)
      .map(() => undefined)
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),

  charge: (params) =>
    deps.client
      .createPayment(deps.credentials, {
        amountMinor: params.amountMinor,
        currency: params.currency,
        capture: true, // сразу списываем (off-session по сохранённой карте)
        description: params.description,
        paymentMethodId: params.methodRef,
        idempotencyKey: params.idempotencyKey,
      })
      // succeeded → оплачено; всё прочее (canceled/застряло) трактуем как отказ → триал лапсится.
      .map((payment) => ({ status: payment.status === 'succeeded' ? ('succeeded' as const) : ('declined' as const) }))
      .mapErr((e) => ({ code: 'gateway_error' as const, message: e.message })),
});
