import type { SubscriptionPlan } from '../domain/plan';
import type { Subscription } from '../domain/subscription';
import type { RiskLevel } from '../domain/trial-policy';

/** Подписка организации. Одна на org (ключ — orgId), поэтому без отдельного id. */
export type SubscriptionRepo = {
  readonly getByOrg: (orgId: string) => Promise<Subscription | null>;
  /** Идемпотентно по orgId (upsert): источник правды по состоянию подписки. */
  readonly save: (subscription: Subscription) => Promise<void>;
  /** Триалы со сроком ≤ nowIso — для фонового истечения (автобиллинг/лапс). */
  readonly listTrialingDueBy: (nowIso: string) => Promise<readonly Subscription[]>;
};

/** Реестр тарифных планов (read-only для use-case подписки). */
export type PlanRepo = {
  readonly get: (planId: string) => Promise<SubscriptionPlan | null>;
  /** Доступные для подписки планы (витрина биллинга). */
  readonly list: () => Promise<readonly SubscriptionPlan[]>;
};

/**
 * Глобальный (cross-tenant) реестр использования триала телефонами.
 * Источник правды для `phoneUsedTrialBefore`: один нормализованный номер = один cardless-триал.
 * Нормализация номера (E.164) — на стороне адаптера/use-case до обращения сюда.
 */
export type TrialEligibilityLedger = {
  readonly hasUsedTrial: (phoneE164: string) => Promise<boolean>;
  /** Зафиксировать использование (идемпотентно по phoneE164). Вызывается при выдаче триала. */
  readonly markUsed: (phoneE164: string, orgId: string, at: string) => Promise<void>;
};

/**
 * Отложенная привязка карты (require_card_first): между редиректом на auth-hold и его
 * подтверждением по вебхуку. Ключ — paymentId холда (externalId из SetupInstruction).
 */
export type CardSetupIntent = {
  readonly paymentId: string;
  readonly orgId: string;
  readonly planId: string;
  readonly phoneE164: string;
  readonly createdAt: string;
};

export type CardSetupIntentRepo = {
  readonly save: (intent: CardSetupIntent) => Promise<void>;
  readonly getByPaymentId: (paymentId: string) => Promise<CardSetupIntent | null>;
  /**
   * Пометить intent обработанным (удалить). Делает подтверждение холда идемпотентным:
   * повторный вебхук того же платежа уже не находит intent и не двоит списание/активацию.
   */
  readonly consume: (paymentId: string) => Promise<void>;
};

/**
 * Глобальный (cross-tenant) реестр использованных карт: одна карта = один триал (по псевдо-
 * отпечатку от шлюза). Барьер для пути require_card_first — повтор требует НОВОЙ реальной карты.
 */
export type CardLedger = {
  readonly hasUsedTrial: (cardFingerprint: string) => Promise<boolean>;
  readonly markUsed: (cardFingerprint: string, orgId: string, at: string) => Promise<void>;
};

/** Мягкие сигналы для скоринга. Используются ТОЛЬКО для трения, не для хард-блока. */
export type RiskSignals = {
  readonly ip?: string;
  readonly deviceFingerprint?: string;
  readonly emailDomain?: string;
};

/**
 * Скорер риска. Адаптер подменяем (эвристика/внешний антифрод). Всё, что он видит, и его вердикт
 * пишутся в audit log — чтобы постфактум ловить паттерны (N org с одного fingerprint за час).
 */
export type RiskScorer = {
  readonly score: (signals: RiskSignals) => Promise<RiskLevel>;
};
