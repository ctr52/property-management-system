/**
 * Доменные типы платежей. Нормализованные, не зависят от форматов провайдеров.
 * Адаптеры (adapters/) переводят между этими типами и DTO Robokassa/ЮKassa/…
 *
 * Граница ответственности: этот модуль исполняет ТОЛЬКО provider-ноги (collector='provider').
 * Ноги, которые собирает площадка (collector='channel'), сюда не попадают как Payment —
 * их статус сводится из ingestion каналов и живёт на уровне PaymentLeg.
 */
import type {
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
} from '@pms/shared';

export type PaymentId = string;

/** Как провайдер отдаёт входящие подтверждения оплаты. */
export type PaymentIngestMode = 'push' | 'poll' | 'none';

/** Декларация возможностей провайдера. Система деградирует по ней мягко. */
export type PaymentCapabilities = {
  readonly refunds: boolean;
  readonly recurring: boolean;
  /** Фискальные чеки (54-ФЗ) на стороне провайдера. */
  readonly receipts: boolean;
  readonly ingest: PaymentIngestMode;
};

/** Наш платёж — исполнение одной provider-ноги плана. */
export type Payment = {
  readonly id: PaymentId;
  readonly orgId: string;
  readonly reservationId: string;
  readonly legId: string;
  readonly provider: PaymentProvider;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: PaymentStatus;
  /** Идемпотентность исходящего: один и тот же ключ → один платёж у провайдера. */
  readonly idempotencyKey: string;
  /** Внешний id транзакции у провайдера (известен после init/первого вебхука). */
  readonly externalId: string | null;
  readonly refundedMinor: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** Вход для адаптера: что именно инициировать у провайдера. */
export type PaymentIntent = {
  readonly paymentId: PaymentId;
  readonly orgId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  readonly purpose: PaymentPurpose;
  /** Куда вернуть гостя после оплаты (наш фронт, не провайдер). */
  readonly returnUrl: string;
  readonly idempotencyKey: string;
};

/**
 * Инструкция гостю — куда идти платить. Пока единственный режим — redirect (hosted page).
 * externalId — id транзакции на стороне провайдера, назначенный на init (Robokassa InvId,
 * YooKassa payment.id, Точка operationId): use-case сохранит его в Payment, чтобы вебхук
 * резолвился по externalId, когда провайдер не возвращает наш paymentId.
 */
export type PaymentInstruction = {
  readonly kind: 'redirect';
  readonly url: string;
  readonly externalId?: string;
};

/** Нормализованное входящее событие от провайдера (после verify+parse вебхука/поллинга). */
export type PaymentEvent = {
  readonly provider: PaymentProvider;
  readonly externalId: string;
  /** Наш paymentId, если провайдер вернул его в payload (иначе матчим по externalId). */
  readonly paymentId: PaymentId | null;
  readonly outcome: 'succeeded' | 'failed' | 'refunded';
  readonly amountMinor: number;
  readonly occurredAt: string;
};

/** Доменная ошибка платежей (без throw — только через Result). */
export type PaymentErrorCode =
  | 'invalid_transition'
  | 'provider_error'
  | 'signature_invalid'
  | 'amount_mismatch'
  | 'unsupported';

export type PaymentError = {
  readonly code: PaymentErrorCode;
  readonly message: string;
};
