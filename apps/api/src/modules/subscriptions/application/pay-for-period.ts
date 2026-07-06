import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { attachPaymentMethod, renew, type Subscription } from '../domain/subscription';
import type { BillingGateway, RedirectInstruction } from '../ports/gateway';
import type { CardSetupIntentRepo, PlanRepo, SubscriptionRepo } from '../ports/repos';

export type PayForPeriodDeps = {
  readonly subscriptions: SubscriptionRepo;
  readonly plans: PlanRepo;
  readonly gateway: BillingGateway;
  /** Отложенная привязка карты (оплата без карты на файле): списание/продление замыкает вебхук холда. */
  readonly cardSetupIntents: CardSetupIntentRepo;
  readonly clock: Clock;
  readonly idGen: IdGen;
};

export type PayForPeriodInput = {
  /** Куда вернуть пользователя после привязки карты (ветка без карты на файле). */
  readonly returnUrl: string;
};

/**
 * Итог оплаты периода:
 *  - paid      — карта на файле, списание прошло → подписка active (дата конца продлена);
 *  - declined  — карта на файле отклонена (нужна другая);
 *  - redirect  — карты нет → прямая оплата на хостед-странице шлюза; продление — на вебхуке payment.succeeded.
 */
export type PayForPeriodOutcome =
  | { readonly kind: 'paid'; readonly subscription: Subscription }
  | { readonly kind: 'declined' }
  | { readonly kind: 'redirect'; readonly setup: RedirectInstruction };

/**
 * Оплата периода подписки — универсальный вход для ЛЮБОГО статуса:
 *  - trialing/active → продлить (оплаченный период клеится к текущей дате конца, см. [[renew]]);
 *  - expired/canceled → реактивация из read-only.
 * Проверок абьюза нет (в отличие от [[trial-policy]]): клиент платит, а не получает триал.
 *
 *  - есть `billingMethodRef` (карта на файле) → синхронное списание → renew;
 *  - нет карты → прямой платёж на стоимость плана (checkoutPeriod) + отложенный intent; продление
 *    делает [[confirm-period-payment]] на вебхуке payment.succeeded (видит существующую подписку).
 *
 * Идемпотентность списания: ключ привязан к текущему концу периода — двойной клик не двоит списание.
 */
export const payForPeriod =
  (deps: PayForPeriodDeps) =>
  async (orgId: string, input: PayForPeriodInput): Promise<Result<PayForPeriodOutcome, AppError>> => {
    const sub = await deps.subscriptions.getByOrg(orgId);
    if (!sub) return err(notFoundError('У организации нет подписки'));

    const plan = await deps.plans.get(sub.planId);
    if (!plan) return err(notFoundError('Тарифный план не найден'));

    // Нет карты на файле → прямая оплата стоимости плана; продление замкнётся на вебхуке payment.succeeded.
    if (sub.billingMethodRef === null) {
      const setup = await deps.gateway.checkoutPeriod({
        orgId,
        planId: plan.id,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        returnUrl: input.returnUrl,
        idempotencyKey: deps.idGen(),
      });
      if (setup.isErr()) return err(validationError(setup.error.message));
      const paymentId = setup.value.externalId;
      if (!paymentId) return err(validationError('Шлюз не вернул id платежа для отслеживания оплаты'));
      await deps.cardSetupIntents.save({
        paymentId,
        orgId,
        planId: plan.id,
        phoneE164: '', // при оплате не используется (проверок телефона нет)
        createdAt: deps.clock.now().toISOString(),
      });
      return ok({ kind: 'redirect', setup: setup.value });
    }

    // Карта на файле → списываем сразу.
    const charge = await deps.gateway.charge({
      methodRef: sub.billingMethodRef,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      description: `Подписка ${plan.name}`,
      idempotencyKey: `pay:${orgId}:${sub.currentPeriodEnd ?? sub.trialEndsAt ?? 'init'}`,
    });
    if (charge.isErr()) return err(validationError(charge.error.message));
    if (charge.value.status === 'declined') return ok({ kind: 'declined' });

    const now = deps.clock.now().toISOString();
    const renewed = renew(attachPaymentMethod(sub, sub.billingMethodRef), { now, periodDays: plan.periodDays });
    if (renewed.isErr()) return err(validationError(renewed.error.message));
    await deps.subscriptions.save(renewed.value);
    return ok({ kind: 'paid', subscription: renewed.value });
  };
