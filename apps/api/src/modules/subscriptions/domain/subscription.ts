import { err, ok, type Result } from 'neverthrow';

/**
 * Чистое ядро жизненного цикла подписки (cardless-триал с защитой от абьюза).
 *
 * Связки с другими доменами:
 *  - вход в триал решает [[trial-policy]] (grant / require_card_first / reject) — use-case;
 *  - замок на отвязку аккаунтов площадок ([[account-binding]] DetachGate) питается из
 *    `isTrialUnpaid` (пока ни разу не оплачено — аккаунты заморожены).
 *
 * Машина статусов:
 *
 *   trialing ──pay/auto-bill──▶ active ──cancel──▶ canceled
 *      │                          ▲                    │
 *      └──trial end, не оплачен──▶ expired ◀──────pay──┘
 *                                  (read-only НАВСЕГДА до оплаты; данные не удаляем)
 *
 * Ключевое продуктовое решение: по истечении неоплаченного триала всё уходит в read-only
 * бессрочно (status='expired'), пока клиент не оплатит. Никаких автоудалений данных.
 */

export type SubscriptionStatus = 'trialing' | 'active' | 'expired' | 'canceled';

export type Subscription = {
  readonly orgId: string;
  readonly planId: string;
  readonly status: SubscriptionStatus;
  /** Конец триала (ISO). null после конвертации/лапса — триал больше не «тикает». */
  readonly trialEndsAt: string | null;
  /** Карта на файле (require_card_first после auth-hold или добавлена позже). Гейтит автобиллинг. */
  readonly paymentMethodAttached: boolean;
  /** Непрозрачная ссылка шлюза на сохранённый способ оплаты (для автосписания). null = нет карты. */
  readonly billingMethodRef: string | null;
  /** Хоть раз оплачено. Снимает замок отвязки аккаунтов площадок (DetachGate.trialUnpaid). */
  readonly everPaid: boolean;
  /** Конец оплаченного периода (ISO) — только для active. */
  readonly currentPeriodEnd: string | null;
};

/**
 * Допустимая длина триала (дней). Диапазон — лишь защита от бессмыслицы; продуктовая политика
 * (типично 2–4 недели) задаётся значением `Plan.trialDays`, см. DEFAULT_TRIAL_DAYS.
 */
export const MIN_TRIAL_DAYS = 1;
export const MAX_TRIAL_DAYS = 90;
export const DEFAULT_TRIAL_DAYS = 14;

export type SubscriptionErrorCode = 'invalid_transition' | 'invalid_trial_days';

export type SubscriptionError = {
  readonly code: SubscriptionErrorCode;
  readonly message: string;
};

const DAY_MS = 86_400_000;

/** Чистое смещение ISO-времени на N дней (now приходит снаружи — без Clock-зависимости). */
const addDays = (iso: string, days: number): string =>
  new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();

/**
 * Старт триала. `withCard` = true для ветки require_card_first (карта уже проверена auth-hold'ом):
 * триал всё равно бесплатный, но в конце автоконвертируется в платный (см. decideTrialExpiry).
 */
export const beginTrial = (params: {
  readonly orgId: string;
  readonly planId: string;
  readonly trialDays: number;
  readonly now: string;
  readonly withCard: boolean;
  /** Ссылка шлюза на сохранённый способ оплаты (carded-триал). null для cardless. */
  readonly billingMethodRef?: string | null;
}): Result<Subscription, SubscriptionError> => {
  const { trialDays } = params;
  if (!Number.isInteger(trialDays) || trialDays < MIN_TRIAL_DAYS || trialDays > MAX_TRIAL_DAYS) {
    return err({
      code: 'invalid_trial_days',
      message: `Длина триала должна быть целым числом дней в диапазоне ${MIN_TRIAL_DAYS}–${MAX_TRIAL_DAYS}`,
    });
  }
  return ok({
    orgId: params.orgId,
    planId: params.planId,
    status: 'trialing',
    trialEndsAt: addDays(params.now, trialDays),
    paymentMethodAttached: params.withCard,
    billingMethodRef: params.billingMethodRef ?? null,
    everPaid: false,
    currentPeriodEnd: null,
  });
};

/** Привязать карту (идемпотентно). Для добавления карты в середине cardless-триала. */
export const attachPaymentMethod = (sub: Subscription, billingMethodRef: string): Subscription =>
  sub.paymentMethodAttached ? sub : { ...sub, paymentMethodAttached: true, billingMethodRef };

/**
 * Что делать по наступлении конца триала. Чистое решение — IO (списание) делает шелл,
 * затем зовёт activate (успех) или lapseTrial (провал/нет карты).
 */
export type TrialExpiryDecision =
  | { readonly kind: 'not_yet' }
  | { readonly kind: 'attempt_renewal' }
  | { readonly kind: 'lapse' }
  | { readonly kind: 'noop' };

export const decideTrialExpiry = (sub: Subscription, now: string): TrialExpiryDecision => {
  if (sub.status !== 'trialing' || sub.trialEndsAt === null) return { kind: 'noop' };
  if (new Date(now).getTime() < new Date(sub.trialEndsAt).getTime()) return { kind: 'not_yet' };
  return sub.paymentMethodAttached ? { kind: 'attempt_renewal' } : { kind: 'lapse' };
};

/**
 * Триал закончился без оплаты (нет карты или списание не прошло) → expired (read-only до оплаты).
 * Легально только из trialing.
 */
export const lapseTrial = (sub: Subscription): Result<Subscription, SubscriptionError> =>
  sub.status === 'trialing'
    ? ok({ ...sub, status: 'expired', trialEndsAt: null, currentPeriodEnd: null })
    : err({ code: 'invalid_transition', message: `Нельзя завершить триал из статуса ${sub.status}` });

/**
 * Платёж захвачен → active. Легально из trialing (автобиллинг/ручная оплата),
 * expired (оплата после лапса) и canceled (повторная подписка).
 */
export const activate = (
  sub: Subscription,
  params: { readonly now: string; readonly periodDays: number },
): Result<Subscription, SubscriptionError> => {
  if (sub.status === 'active') {
    return err({ code: 'invalid_transition', message: 'Подписка уже активна' });
  }
  return ok({
    ...sub,
    status: 'active',
    everPaid: true,
    trialEndsAt: null,
    currentPeriodEnd: addDays(params.now, params.periodDays),
  });
};

/** Пользователь отменил активную подписку → canceled (read-only до повторной оплаты). */
export const cancel = (sub: Subscription): Result<Subscription, SubscriptionError> =>
  sub.status === 'active'
    ? ok({ ...sub, status: 'canceled' })
    : err({ code: 'invalid_transition', message: `Отменить можно только активную подписку (сейчас ${sub.status})` });

/** Доступ только на чтение: триал истёк или подписка отменена, оплата не покрывает период. */
export const isReadOnly = (sub: Subscription): boolean =>
  sub.status === 'expired' || sub.status === 'canceled';

/**
 * «Триал не оплачен» для [[account-binding]] DetachGate: пока ни разу не платили,
 * привязанные аккаунты площадок заморожены (нельзя отвязать ради нового триала).
 */
export const isTrialUnpaid = (sub: Subscription): boolean => !sub.everPaid;
