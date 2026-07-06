import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { attachPaymentMethod, beginTrial, renew } from '../domain/subscription';
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
 *  - ignored      — intent не найден (шум шлюза ИЛИ повторный вебхук уже обработанного платежа);
 *  - pending      — карта ещё не введена/не подтверждена (intent не потребляем — ждём);
 *  - failed       — холд не встал (карта отклонена);
 *  - card_reused  — карта уже жгла триал → холд снят, триал НЕ выдан;
 *  - trial_started — выдан carded-триал (новая org, подписки ещё не было);
 *  - paid         — списание периода прошло → подписка active (реактивация ИЛИ оплата в триале);
 *  - declined     — карта привязана, но списание периода отклонено.
 */
export type ConfirmCardSetupResult =
  | 'ignored'
  | 'pending'
  | 'failed'
  | 'card_reused'
  | 'trial_started'
  | 'paid'
  | 'declined';

/**
 * Замыкает привязку карты по подтверждению auth-hold. Что значит привязка — определяется
 * состоянием подписки org (источник правды), а не флагом в intent:
 *  - подписки нет            → require_card_first ([[trial-policy]]) → carded-триал (без списания);
 *  - подписка есть (любой статус) → оплата периода: списать план + [[renew]] (продлить дату конца).
 *    Это единый путь и для реактивации из read-only, и для оплаты во время триала ([[pay-for-period]]).
 *
 * Идемпотентность: intent одноразовый — по завершении `consume`. Повторный вебхук того же платежа
 * не находит intent → 'ignored' (без двойного списания/старта). Источник правды по статусу холда —
 * re-fetch у шлюза (тело вебхука неподписано).
 */
export const confirmCardSetup =
  (deps: ConfirmCardSetupDeps) =>
  async (paymentId: string): Promise<Result<ConfirmCardSetupResult, AppError>> => {
    const intent = await deps.cardSetupIntents.getByPaymentId(paymentId);
    if (!intent) return ok('ignored');

    const setup = await deps.gateway.getSetupResult(paymentId);
    if (setup.isErr()) return err(validationError(setup.error.message)); // сбой шлюза → intent жив, повтор
    if (setup.value.status === 'pending') return ok('pending'); // карта ещё не введена — intent не трогаем
    if (setup.value.status === 'failed') {
      await deps.cardSetupIntents.consume(paymentId); // холд не встал — intent мёртв
      return ok('failed');
    }

    const now = deps.clock.now().toISOString();
    const plan = await deps.plans.get(intent.planId);
    if (!plan) return err(notFoundError('Тарифный план не найден')); // конфиг: не потребляем, разберёмся

    const existing = await deps.subscriptions.getByOrg(intent.orgId);

    // --- Есть подписка → оплата периода: списать план по сохранённой карте и продлить. ---
    // Единый путь для реактивации (expired/canceled) и оплаты во время триала/active.
    if (existing) {
      const methodRef = setup.value.paymentMethodId;
      if (!methodRef) return err(validationError('Шлюз не вернул сохранённый способ оплаты'));

      const charge = await deps.gateway.charge({
        methodRef,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        description: `Подписка ${plan.name}`,
        // Ключ привязан к текущему концу периода → двойной вебхук не двоит списание.
        idempotencyKey: `pay:${existing.orgId}:${existing.currentPeriodEnd ?? existing.trialEndsAt ?? 'init'}`,
      });
      if (charge.isErr()) return err(validationError(charge.error.message)); // сеть/шлюз → intent жив, повтор

      // Проверочный холд больше не нужен — деньги периода списаны отдельным charge.
      await deps.gateway.releaseHold(paymentId, deps.idGen()); // best-effort
      await deps.cardSetupIntents.consume(paymentId);
      if (charge.value.status === 'declined') return ok('declined');

      const renewed = renew(attachPaymentMethod(existing, methodRef), { now, periodDays: plan.periodDays });
      if (renewed.isErr()) return err(validationError(renewed.error.message));
      await deps.subscriptions.save(renewed.value);
      return ok('paid');
    }

    // --- Подписки нет (новая org): барьер «одна карта = один триал» + старт carded-триала. ---
    const fingerprint = setup.value.cardFingerprint;
    if (fingerprint && (await deps.cardLedger.hasUsedTrial(fingerprint))) {
      await deps.gateway.releaseHold(paymentId, deps.idGen()); // best-effort: холд истечёт и сам
      await deps.cardSetupIntents.consume(paymentId);
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
    await deps.cardSetupIntents.consume(paymentId);

    return ok('trial_started');
  };
