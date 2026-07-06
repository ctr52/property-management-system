import type { SubscriptionPlan } from '../../domain/plan';
import type { Subscription } from '../../domain/subscription';
import type { RiskLevel } from '../../domain/trial-policy';
import type { PhoneVerificationGate } from '../../ports/phone-verification';
import type {
  CardLedger,
  CardSetupIntent,
  CardSetupIntentRepo,
  PlanRepo,
  RiskScorer,
  SubscriptionRepo,
  TrialEligibilityLedger,
} from '../../ports/repos';

/** In-memory подписки (ключ — orgId). Переезд на drizzle = смена адаптера, порт тот же. */
export const createInMemorySubscriptionRepo = (): SubscriptionRepo => {
  const byOrg = new Map<string, Subscription>();
  return {
    getByOrg: async (orgId) => byOrg.get(orgId) ?? null,
    save: async (subscription) => void byOrg.set(subscription.orgId, subscription),
    listTrialingDueBy: async (nowIso) =>
      [...byOrg.values()].filter(
        (s) => s.status === 'trialing' && s.trialEndsAt !== null && s.trialEndsAt <= nowIso,
      ),
  };
};

/** In-memory реестр тарифных планов (read-only). */
export const createInMemoryPlanRepo = (plans: readonly SubscriptionPlan[]): PlanRepo => {
  const byId = new Map(plans.map((p) => [p.id, p]));
  return {
    get: async (planId) => byId.get(planId) ?? null,
    list: async () => plans,
  };
};

/**
 * In-memory eligibility ledger (cross-tenant): один номер E.164 = один cardless-триал навсегда.
 * markUsed идемпотентен по phoneE164 (повтор не перетирает первую org/время).
 */
export const createInMemoryTrialEligibilityLedger = (): TrialEligibilityLedger => {
  const used = new Map<string, { orgId: string; at: string }>();
  return {
    hasUsedTrial: async (phoneE164) => used.has(phoneE164),
    markUsed: async (phoneE164, orgId, at) => {
      if (!used.has(phoneE164)) used.set(phoneE164, { orgId, at });
    },
  };
};

/** In-memory отложенные привязки карт (ключ — paymentId холда). */
export const createInMemoryCardSetupIntentRepo = (): CardSetupIntentRepo => {
  const byPaymentId = new Map<string, CardSetupIntent>();
  return {
    save: async (intent) => void byPaymentId.set(intent.paymentId, intent),
    getByPaymentId: async (paymentId) => byPaymentId.get(paymentId) ?? null,
  };
};

/** In-memory card-ledger: одна карта (по отпечатку) = один триал навсегда. markUsed идемпотентен. */
export const createInMemoryCardLedger = (): CardLedger => {
  const used = new Map<string, { orgId: string; at: string }>();
  return {
    hasUsedTrial: async (cardFingerprint) => used.has(cardFingerprint),
    markUsed: async (cardFingerprint, orgId, at) => {
      if (!used.has(cardFingerprint)) used.set(cardFingerprint, { orgId, at });
    },
  };
};

/** Одноразовые/дешёвые почтовые домены — слабый сигнал риска (только трение, не блок). */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'trashmail.com',
]);

/**
 * Эвристический риск-скорер. Мягкие сигналы → трение, НЕ хард-блок. Заменяется на внешний
 * антифрод за тем же портом. Реальный аудит/сбор паттернов делает use-case через audit log.
 */
export const createHeuristicRiskScorer = (): RiskScorer => ({
  score: async (signals): Promise<RiskLevel> => {
    if (signals.emailDomain && DISPOSABLE_EMAIL_DOMAINS.has(signals.emailDomain.toLowerCase())) {
      return 'high';
    }
    return 'low';
  },
});

/**
 * DEV-заглушка гейта подтверждения телефона: считает ЛЮБОЙ номер подтверждённым.
 * ВНИМАНИЕ: небезопасно для прода — заменить на реальную верификацию звонком (модуль identity),
 * иначе любой клиент получит триал без подтверждения телефона.
 */
export const createDevAllowAllPhoneVerification = (): PhoneVerificationGate => ({
  isVerified: async () => true,
});
