import { err, ok, type Result } from 'neverthrow';
import { type AppError, conflictError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { beginTrial, type Subscription } from '../domain/subscription';
import { decideTrialPolicy } from '../domain/trial-policy';
import type { SetupInstruction, BillingGateway } from '../ports/gateway';
import type { PhoneVerificationGate } from '../ports/phone-verification';
import type {
  CardSetupIntentRepo,
  PlanRepo,
  RiskScorer,
  SubscriptionRepo,
  TrialEligibilityLedger,
} from '../ports/repos';

export type SubscribeToPlanDeps = {
  readonly plans: PlanRepo;
  readonly subscriptions: SubscriptionRepo;
  readonly ledger: TrialEligibilityLedger;
  readonly riskScorer: RiskScorer;
  readonly gateway: BillingGateway;
  /** Отложенные привязки карт (require_card_first) — ждут подтверждения холда по вебхуку. */
  readonly cardSetupIntents: CardSetupIntentRepo;
  /** Подтверждённость телефона проверяем на сервере, не доверяя клиенту. */
  readonly phoneVerification: PhoneVerificationGate;
  readonly clock: Clock;
  readonly idGen: IdGen;
};

export type SubscribeToPlanInput = {
  readonly planId: string;
  /** Уже нормализованный E.164 (нормализация — на стороне http/адаптера). */
  readonly phoneE164: string;
  /** Мягкие сигналы для скоринга риска (только трение, не блок). ip берётся на сервере из запроса. */
  readonly risk: { readonly ip?: string; readonly deviceFingerprint?: string; readonly emailDomain?: string };
  /** Куда вернуть пользователя после привязки карты (ветка require_card_first). */
  readonly returnUrl: string;
};

/**
 * Итог попытки подписки:
 *  - trial_started — выдан cardless-триал (grant_trial);
 *  - card_required — нужна привязка карты (require_card_first): редирект на auth-hold,
 *    сам триал стартует на подтверждении холда (вебхук), не здесь;
 *  - rejected — политика отказала (нет подтверждённого телефона).
 */
export type SubscribeOutcome =
  | { readonly kind: 'trial_started'; readonly subscription: Subscription }
  | { readonly kind: 'card_required'; readonly setup: SetupInstruction; readonly reason: string }
  | { readonly kind: 'rejected'; readonly reason: string };

/**
 * Вход в подписку (старт триала). Оркестрирует домен + порты, IO — по краям.
 *  1. одна подписка на org (повторно — conflict; реактивация expired/canceled — другой use-case);
 *  2. план существует;
 *  3. сигналы (ledger + риск-скоринг) → decideTrialPolicy → ветка.
 */
export const subscribeToPlan =
  (deps: SubscribeToPlanDeps) =>
  async (orgId: string, input: SubscribeToPlanInput): Promise<Result<SubscribeOutcome, AppError>> => {
    const existing = await deps.subscriptions.getByOrg(orgId);
    if (existing) return err(conflictError('У организации уже есть подписка'));

    const plan = await deps.plans.get(input.planId);
    if (!plan) return err(notFoundError('Тарифный план не найден'));

    const phoneVerified = await deps.phoneVerification.isVerified(input.phoneE164);
    const phoneUsedTrialBefore = await deps.ledger.hasUsedTrial(input.phoneE164);
    const risk = await deps.riskScorer.score(input.risk);
    const policy = decideTrialPolicy({ phoneVerified, phoneUsedTrialBefore, risk });

    if (policy.kind === 'reject') {
      return ok({ kind: 'rejected', reason: policy.reason });
    }

    if (policy.kind === 'require_card_first') {
      const setup = await deps.gateway.setupPaymentMethod({
        orgId,
        planId: plan.id,
        returnUrl: input.returnUrl,
        idempotencyKey: deps.idGen(),
      });
      if (setup.isErr()) return err(validationError(setup.error.message));
      // Запоминаем отложенную привязку: триал стартует на подтверждении холда (confirmCardSetup).
      const paymentId = setup.value.externalId;
      if (!paymentId) return err(validationError('Шлюз не вернул id платежа для отслеживания привязки карты'));
      await deps.cardSetupIntents.save({
        paymentId,
        orgId,
        planId: plan.id,
        phoneE164: input.phoneE164,
        createdAt: deps.clock.now().toISOString(),
      });
      return ok({ kind: 'card_required', setup: setup.value, reason: policy.reason });
    }

    // grant_trial — cardless-триал стартует сразу.
    const now = deps.clock.now().toISOString();
    const created = beginTrial({ orgId, planId: plan.id, trialDays: plan.trialDays, now, withCard: false });
    if (created.isErr()) return err(validationError(created.error.message));

    await deps.subscriptions.save(created.value);
    // Помечаем номер использованным только когда триал реально выдан (идемпотентно по phoneE164).
    await deps.ledger.markUsed(input.phoneE164, orgId, now);

    return ok({ kind: 'trial_started', subscription: created.value });
  };
