import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock } from '../../../shared/ports';
import { attachPaymentMethod, renew } from '../domain/subscription';
import type { BillingGateway } from '../ports/gateway';
import type { CardSetupIntentRepo, PlanRepo, SubscriptionRepo } from '../ports/repos';

export type ConfirmPeriodPaymentDeps = {
  readonly gateway: BillingGateway;
  readonly cardSetupIntents: CardSetupIntentRepo;
  readonly subscriptions: SubscriptionRepo;
  readonly plans: PlanRepo;
  readonly clock: Clock;
};

/**
 * Результат подтверждения оплаты периода (событие payment.succeeded / payment.canceled):
 *  - ignored  — intent не найден (шум/дубль) ИЛИ подписки нет (оплата всегда по существующей);
 *  - pending  — платёж ещё не завершён (intent не потребляем);
 *  - declined — платёж отклонён/отменён;
 *  - paid     — оплата прошла → подписка active, дата конца продлена + карта сохранена.
 */
export type ConfirmPeriodPaymentResult = 'ignored' | 'pending' | 'declined' | 'paid';

/**
 * Замыкает прямую оплату периода ([[pay-for-period]] без карты на файле): платёж на стоимость плана
 * прошёл (payment.succeeded) → продлеваем подписку ([[renew]]) и сохраняем карту для автобиллинга.
 * Единый путь для оплаты в триале/active и реактивации из read-only.
 *
 * Идемпотентность: intent одноразовый (`consume`). Источник правды по статусу — re-fetch у шлюза.
 */
export const confirmPeriodPayment =
  (deps: ConfirmPeriodPaymentDeps) =>
  async (paymentId: string): Promise<Result<ConfirmPeriodPaymentResult, AppError>> => {
    const intent = await deps.cardSetupIntents.getByPaymentId(paymentId);
    if (!intent) return ok('ignored');

    const payment = await deps.gateway.getPeriodPayment(paymentId);
    if (payment.isErr()) return err(validationError(payment.error.message)); // сбой шлюза → intent жив, повтор
    if (payment.value.status === 'pending') return ok('pending'); // платёж не завершён — intent не трогаем
    if (payment.value.status === 'canceled') {
      await deps.cardSetupIntents.consume(paymentId);
      return ok('declined');
    }

    // Оплата всегда по существующей подписке (payForPeriod требует её наличия).
    const existing = await deps.subscriptions.getByOrg(intent.orgId);
    if (!existing) {
      await deps.cardSetupIntents.consume(paymentId);
      return ok('ignored');
    }

    const plan = await deps.plans.get(intent.planId);
    if (!plan) return err(notFoundError('Тарифный план не найден')); // конфиг: не потребляем

    // Карта сохранена при оплате → кладём ref для будущего автобиллинга (если шлюз его вернул).
    const withCard = payment.value.paymentMethodId
      ? attachPaymentMethod(existing, payment.value.paymentMethodId)
      : existing;

    const now = deps.clock.now().toISOString();
    const renewed = renew(withCard, { now, periodDays: plan.periodDays });
    if (renewed.isErr()) return err(validationError(renewed.error.message));

    await deps.subscriptions.save(renewed.value);
    await deps.cardSetupIntents.consume(paymentId);
    return ok('paid');
  };
