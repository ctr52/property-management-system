import { err, ok, type Result } from 'neverthrow';
import { type AppError, conflictError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { activate, attachPaymentMethod, isReadOnly, type Subscription } from '../domain/subscription';
import type { BillingGateway, SetupInstruction } from '../ports/gateway';
import type { CardSetupIntentRepo, PlanRepo, SubscriptionRepo } from '../ports/repos';

export type ReactivateSubscriptionDeps = {
  readonly subscriptions: SubscriptionRepo;
  readonly plans: PlanRepo;
  readonly gateway: BillingGateway;
  /** Отложенная привязка карты (cardless-реактивация): активация замыкается на вебхуке холда. */
  readonly cardSetupIntents: CardSetupIntentRepo;
  readonly clock: Clock;
  readonly idGen: IdGen;
};

export type ReactivateInput = {
  /** Куда вернуть пользователя после привязки карты (ветка без карты на файле). */
  readonly returnUrl: string;
};

/**
 * Итог попытки оплаты из read-only:
 *  - activated   — карта на файле, списание прошло → подписка снова active;
 *  - declined    — карта на файле, но списание отклонено (нужна другая карта);
 *  - card_required — карты на файле нет → редирект на привязку (активация — на вебхуке холда).
 */
export type ReactivateOutcome =
  | { readonly kind: 'activated'; readonly subscription: Subscription }
  | { readonly kind: 'declined' }
  | { readonly kind: 'card_required'; readonly setup: SetupInstruction };

/**
 * Оплата из read-only (expired/canceled) → active. Парный к [[trial-policy]] вход, но без
 * проверок абьюза: клиент платит, а не получает триал.
 *  - есть `billingMethodRef` (карта на файле) → синхронное списание → activate;
 *  - нет карты → auth-hold (setupPaymentMethod) + отложенный intent; реальное списание и activate
 *    делает confirmCardSetup на подтверждении холда (видит существующую read-only подписку).
 *
 * Идемпотентность списания: ключ привязан к текущему (неоплаченному) состоянию подписки —
 * двойной клик не двоит списание; после активации use-case уже отдаёт conflict.
 */
export const reactivateSubscription =
  (deps: ReactivateSubscriptionDeps) =>
  async (orgId: string, input: ReactivateInput): Promise<Result<ReactivateOutcome, AppError>> => {
    const sub = await deps.subscriptions.getByOrg(orgId);
    if (!sub) return err(notFoundError('У организации нет подписки'));
    if (!isReadOnly(sub)) return err(conflictError('Подписка уже активна'));

    const plan = await deps.plans.get(sub.planId);
    if (!plan) return err(notFoundError('Тарифный план не найден'));

    // Нет карты на файле → собираем её через auth-hold, активация замкнётся на вебхуке.
    if (sub.billingMethodRef === null) {
      const setup = await deps.gateway.setupPaymentMethod({
        orgId,
        planId: plan.id,
        returnUrl: input.returnUrl,
        idempotencyKey: deps.idGen(),
      });
      if (setup.isErr()) return err(validationError(setup.error.message));
      const paymentId = setup.value.externalId;
      if (!paymentId) return err(validationError('Шлюз не вернул id платежа для отслеживания привязки карты'));
      await deps.cardSetupIntents.save({
        paymentId,
        orgId,
        planId: plan.id,
        phoneE164: '', // не используется в реактивации (телефон уже сжёг триал ранее)
        createdAt: deps.clock.now().toISOString(),
      });
      return ok({ kind: 'card_required', setup: setup.value });
    }

    // Карта на файле → списываем сразу.
    const charge = await deps.gateway.charge({
      methodRef: sub.billingMethodRef,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      description: `Подписка ${plan.name}`,
      idempotencyKey: `reactivate:${orgId}:${sub.currentPeriodEnd ?? 'init'}`,
    });
    if (charge.isErr()) return err(validationError(charge.error.message));
    if (charge.value.status === 'declined') return ok({ kind: 'declined' });

    const now = deps.clock.now().toISOString();
    const activated = activate(attachPaymentMethod(sub, sub.billingMethodRef), {
      now,
      periodDays: plan.periodDays,
    });
    if (activated.isErr()) return err(validationError(activated.error.message));
    await deps.subscriptions.save(activated.value);
    return ok({ kind: 'activated', subscription: activated.value });
  };
