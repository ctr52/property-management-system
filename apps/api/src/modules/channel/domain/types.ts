/**
 * Доменные типы channel-manager. Нормализованные, не зависят от форматов площадок.
 * Адаптеры (adapters/) переводят между этими типами и DTO Avito/Cian.
 */

export type Platform = 'avito' | 'cian';

/** Как площадка отдаёт входящие данные (сообщения/брони). */
export type IngestionMode = 'push' | 'poll' | 'none';

/**
 * Как площадка подтверждает публикацию листинга (обратная связь по «applied»):
 *  - sync    — синхронный ответ API сразу говорит, применилось ли;
 *  - poll    — узнаём опросом (Cian: get-order/get-my-offers);
 *  - webhook — площадка присылает результат модерации;
 *  - none    — обратной связи нет, дальше «отправлено» подтвердить нельзя.
 */
export type PublishFeedbackMode = 'sync' | 'poll' | 'webhook' | 'none';

/** Декларация возможностей площадки. Система деградирует по ней мягко. */
export type ChannelCapabilities = {
  readonly listingPublish: 'feed' | 'api' | 'none';
  readonly priceSync: 'per-date' | 'base-only' | 'none';
  readonly availabilitySync: 'per-date' | 'none';
  readonly bookingIngest: IngestionMode;
  readonly messaging: IngestionMode;
  readonly publishFeedback: PublishFeedbackMode;
};

/** Нейтральная категория листинга (маппится в формат площадки внутри адаптера). */
export type ListingCategory = 'flat_rent' | 'flat_sale' | 'house_rent';

/** Нормализованный листинг — вход для публикаторов (фид/API). */
export type ListingInput = {
  readonly externalId: string;
  readonly title: string;
  readonly description: string;
  readonly address: string;
  readonly category: ListingCategory;
  readonly basePriceMinor: number;
  readonly currency: string;
  readonly photos: readonly string[];
  readonly rooms?: number;
  readonly areaSqm?: number;
};

export type FeedDocument = {
  readonly contentType: string;
  readonly body: string;
};

/** Обновление цены/доступности по конкретной дате (для per-date площадок). */
export type PriceUpdate = { readonly date: string; readonly amountMinor: number };
export type AvailabilityUpdate = { readonly date: string; readonly available: boolean };

/** Нормализованное входящее сообщение (unified inbox). */
export type ChannelMessage = {
  readonly platform: Platform;
  readonly externalThreadId: string;
  readonly externalMessageId: string;
  readonly direction: 'in' | 'out';
  readonly text: string;
  readonly sentAt: string;
};

/** Нормализованная внешняя бронь. */
export type ExternalBooking = {
  readonly platform: Platform;
  readonly externalBookingId: string;
  readonly externalListingId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly guestName?: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: 'new' | 'confirmed' | 'cancelled';
};

/** Унифицированное событие, которое Ingestion Runner кладёт в нормализованный стор. */
export type ChannelEvent =
  | { readonly type: 'message'; readonly payload: ChannelMessage }
  | { readonly type: 'booking'; readonly payload: ExternalBooking };

/**
 * Фаза синхронизации последней отправки на площадку (state-machine «объект × площадка»):
 * queued → pushed → applied, либо → error. Само «актуально/устарело» выводится не отсюда,
 * а из сравнения ревизий (см. deriveSyncStatus).
 */
export type SyncPhase = 'queued' | 'pushed' | 'applied' | 'error';

/** Связь «наш объект ↔ внешний листинг» + per-channel статус синхронизации. */
export type ListingMode = 'managed' | 'attached';

export type ListingLink = {
  readonly id: string;
  readonly orgId: string;
  readonly propertyId: string;
  readonly platform: Platform;
  readonly mode: ListingMode;
  readonly externalId: string;
  readonly platformListingId: string | null;
  readonly phase: SyncPhase;
  /** Ревизия контента, которую хотим видеть в эфире (растёт с каждой правкой объекта). */
  readonly desiredRevision: number;
  /** Ревизия, которую последней отправили на площадку (к ней относится приходящее подтверждение). */
  readonly pushedRevision: number | null;
  /** Ревизия, которую площадка подтвердила живой (null — ещё ничего не подтверждено). */
  readonly appliedRevision: number | null;
  readonly lastPushedAt: string | null;
  readonly lastConfirmedAt: string | null;
  readonly lastError: string | null;
};

/**
 * Подтверждение публикации, которое Reconciler сводит в ListingLink (по externalId).
 * Возвращается адаптером из poll (Cian get-order) или webhook (Avito модерация).
 */
export type PublishConfirmation = {
  readonly externalId: string;
  readonly outcome: 'applied' | 'error';
  readonly platformListingId?: string;
  /** Ревизия, если площадка её возвращает; иначе берём pushedRevision связи. */
  readonly revision?: number;
  readonly error?: string;
};

export type ChannelAccount = {
  readonly id: string;
  readonly orgId: string;
  readonly platform: Platform;
  readonly status: 'active' | 'disabled';
  /** Ссылка на секрет (в vault), а не сам секрет. */
  readonly credentialsRef: string | null;
  readonly createdAt: string;
};

/** Курсор поллинга (например, last-seen id/timestamp). */
export type Cursor = string | null;

/** Ошибки слоя интеграций. Возвращаются через neverthrow Result. */
export type ChannelError =
  | { readonly kind: 'auth'; readonly message: string }
  | { readonly kind: 'rate_limit'; readonly retryAfterSec?: number; readonly message: string }
  | { readonly kind: 'mapping'; readonly message: string }
  | { readonly kind: 'transport'; readonly message: string }
  | { readonly kind: 'not_implemented'; readonly message: string };

export const mappingError = (message: string): ChannelError => ({ kind: 'mapping', message });
export const notImplemented = (message: string): ChannelError => ({ kind: 'not_implemented', message });
