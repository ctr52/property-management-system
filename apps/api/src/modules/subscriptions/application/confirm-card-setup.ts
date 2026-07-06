import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { activate, attachPaymentMethod, beginTrial, isReadOnly } from '../domain/subscription';
import type { BillingGateway } from '../ports/gateway';
import type { CardLedger, CardSetupIntentRepo, PlanRepo, SubscriptionRepo } from '../ports/repos';

export type ConfirmCardSetupDeps = {
  readonly gateway: BillingGateway;
  readonly cardSetupIntents: CardSetupIntentRepo;
  readonly subscriptions: SubscriptionRepo;
  readonly plans: PlanRepo;
  readonly cardLedger: CardLedger;
  readonly clock: Clock;
  readonly idGen: IdGen;
};

/**
 * Результат обработки подтверждения холда:
 *  - ignored      — платёж не наш (нет отложенной привязки) — типично шум от шлюза;
 *  - already      — подписка уже активна/в триале (идемпотентность повторного вебхука);
 *  - pending      — карта ещё не введена/не подтверждена;
 *  - failed       — холд не встал (карта отклонена);
 *  - card_reused  — карта уже жгла триал → холд снят, триал НЕ выдан;
 *  - trial_started — выдан carded-триал (новая org);
 *  - reactivated  — оплата из read-only прошла → подписка снова active;
 *  - reactivation_declined — карта привязана, но списание периода отклонено.
 */
export type ConfirmCardSetupResult =
  | 'ignored'
  | 'already'
  | 'pending'
  | 'failed'
  | 'card_reused'
  | 'trial_started'
  | 'reactivated'
  | 'reactivation_declined';

/**
 * Замыкает оба пути привязки карты по подтверждению auth-hold. Что именно значит привязка —
 * определяется состоянием подписки org (источник правды), а не флагом в intent:
 *  - подписки нет           → require_card_first ([[trial-policy]]) → carded-триал;
 *  - подписка read-only     → реактивация ([[reactivate-subscription]]) → списать период → active;
 *  - подписка активна/триал  → 'already' (идемпотентность повторного вебхука).
 *
 * Источник правды по статусу холда — re-fetch у шлюза (тело вебхука неподписано).
 */
export const confirmCardSetup =
  (deps: ConfirmCardSetupDeps) =>
  async (paymentId: string): Promise<Result<ConfirmCardSetupResult, AppError>> => {
    const intent = await deps.cardSetupIntents.getByPaymentId(paymentId);
    if (!intent) return ok('ignored');

    const existing = await deps.subscriptions.getByOrg(intent.orgId);
    // Активная/в триале подписка — повторный вебхук, ничего не делаем.
    if (existing && !isReadOnly(existing)) return ok('already');

    const setup = await deps.gateway.getSetupResult(paymentId);
    if (setup.isErr()) return err(validationError(setup.error.message));
    if (setup.value.status === 'pending') return ok('pending');
    if (setup.value.status === 'failed') return ok('failed');

    const now = deps.clock.now().toISOString();

    const plan = await deps.plans.get(intent.planId);
    if (!plan) return err(notFoundError('Тарифный план не найден'));

    // --- Реактивация: подписка существует и в read-only → оплатить период и активировать. ---
    if (existing) {
      const methodRef = setup.value.paymentMethodId;
      if (!methodRef) return err(validationError('Шлюз не вернул сохранённый способ оплаты'));

      const charge = await deps.gateway.charge({
        methodRef,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        description: `Подписка ${plan.name}`,
        idempotencyKey: `reactivate:${existing.orgId}:${existing.currentPeriodEnd ?? 'init'}`,
      });
      if (charge.isErr()) return err(validationError(charge.error.message));

      // Проверочный холд больше не нужен — деньги периода уже списаны отдельно.
      await deps.gateway.releaseHold(paymentId, deps.idGen()); // best-effort
      if (charge.value.status === 'declined') return ok('reactivation_declined');

      const activated = activate(attachPaymentMethod(existing, methodRef), {
        now,
        periodDays: plan.periodDays,
      });
      if (activated.isErr()) return err(validationError(activated.error.message));
      await deps.subscriptions.save(activated.value);
      return ok('reactivated');
    }

    // --- Триал (новая org): барьер «одна карта = один триал» + старт carded-триала. ---
    const fingerprint = setup.value.cardFingerprint;
    if (fingerprint && (await deps.cardLedger.hasUsedTrial(fingerprint))) {
      await deps.gateway.releaseHold(paymentId, deps.idGen()); // best-effort: холд истечёт и сам
      return ok('card_reused');
    }

    const created = beginTrial({
      orgId: intent.orgId,
      planId: plan.id,
      trialDays: plan.trialDays,
      now,
      withCard: true,
      billingMethodRef: setup.value.paymentMethodId, // для автосписания в конце триала
    });
    if (created.isErr()) return err(validationError(created.error.message));

    await deps.subscriptions.save(created.value);
    if (fingerprint) await deps.cardLedger.markUsed(fingerprint, intent.orgId, now);
    // Снимаем проверочный холд — деньги не списываем, карта осталась сохранённой для автобиллинга.
    await deps.gateway.releaseHold(paymentId, deps.idGen()); // best-effort: при сбое холд истечёт сам

    return ok('trial_started');
  };
