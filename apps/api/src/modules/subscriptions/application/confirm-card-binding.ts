import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock } from '../../../shared/ports';
import { beginTrial } from '../domain/subscription';
import type { BillingGateway } from '../ports/gateway';
import type { CardLedger, CardSetupIntentRepo, PlanRepo, SubscriptionRepo } from '../ports/repos';

export type ConfirmCardBindingDeps = {
  readonly gateway: BillingGateway;
  readonly cardSetupIntents: CardSetupIntentRepo;
  readonly subscriptions: SubscriptionRepo;
  readonly plans: PlanRepo;
  readonly cardLedger: CardLedger;
  readonly clock: Clock;
};

/**
 * Результат подтверждения привязки карты (событие payment_method.active):
 *  - ignored       — intent не найден (шум/дубль) ИЛИ подписка уже есть (привязка только для новой org);
 *  - pending       — карта ещё не введена/не подтверждена (intent не потребляем);
 *  - failed        — привязка не удалась (карта отклонена);
 *  - card_reused   — карта уже жгла триал → триал НЕ выдан;
 *  - trial_started — выдан carded-триал (require_card_first).
 */
export type ConfirmCardBindingResult = 'ignored' | 'pending' | 'failed' | 'card_reused' | 'trial_started';

/**
 * Замыкает привязку карты для триала require_card_first ([[trial-policy]]): карта сохранена
 * БЕЗ списания (zero-amount binding), событие payment_method.active. Барьер «одна карта = один
 * триал» + старт carded-триала. Списания здесь нет (в конце триала — автобиллинг, [[run-trial-expiry]]).
 *
 * Идемпотентность: intent одноразовый (`consume`). Источник правды по статусу — re-fetch у шлюза.
 */
export const confirmCardBinding =
  (deps: ConfirmCardBindingDeps) =>
  async (bindingId: string): Promise<Result<ConfirmCardBindingResult, AppError>> => {
    const intent = await deps.cardSetupIntents.getByPaymentId(bindingId);
    if (!intent) return ok('ignored');

    const binding = await deps.gateway.getCardBinding(bindingId);
    if (binding.isErr()) return err(validationError(binding.error.message)); // сбой шлюза → intent жив, повтор
    if (binding.value.status === 'pending') return ok('pending'); // ждём ввод карты — intent не трогаем
    if (binding.value.status === 'failed') {
      await deps.cardSetupIntents.consume(bindingId);
      return ok('failed');
    }

    // Привязка для триала действительна только для НОВОЙ org (подписки ещё нет).
    const existing = await deps.subscriptions.getByOrg(intent.orgId);
    if (existing) {
      await deps.cardSetupIntents.consume(bindingId);
      return ok('ignored');
    }

    const plan = await deps.plans.get(intent.planId);
    if (!plan) return err(notFoundError('Тарифный план не найден')); // конфиг: не потребляем

    // Барьер «одна карта = один триал».
    const fingerprint = binding.value.cardFingerprint;
    if (fingerprint && (await deps.cardLedger.hasUsedTrial(fingerprint))) {
      await deps.cardSetupIntents.consume(bindingId);
      return ok('card_reused');
    }

    const now = deps.clock.now().toISOString();
    const created = beginTrial({
      orgId: intent.orgId,
      planId: plan.id,
      trialDays: plan.trialDays,
      now,
      withCard: true,
      billingMethodRef: binding.value.paymentMethodId, // для автосписания в конце триала
    });
    if (created.isErr()) return err(validationError(created.error.message));

    await deps.subscriptions.save(created.value);
    if (fingerprint) await deps.cardLedger.markUsed(fingerprint, intent.orgId, now);
    await deps.cardSetupIntents.consume(bindingId);

    return ok('trial_started');
  };
