import type { Result, ResultAsync } from 'neverthrow';
import type { ExternalAccountIdentity } from '../domain/account-binding';
import type {
  AvailabilityUpdate,
  ChannelAccount,
  ChannelCapabilities,
  ChannelError,
  ChannelEvent,
  ChannelMessage,
  Cursor,
  ExternalBooking,
  FeedDocument,
  ListingInput,
  ListingLink,
  Platform,
  PriceUpdate,
  PublishConfirmation,
} from '../domain/types';

export type Sink<E> = (events: readonly E[]) => Promise<void>;
export type Unsubscribe = () => Promise<void>;
export type PollResult<E> = { readonly events: readonly E[]; readonly cursor: Cursor };

/**
 * Ключевая абстракция: способ приёма входящих данных.
 * push/poll/none — внутреннее свойство адаптера. Потребитель его НЕ видит:
 * единый Ingestion Runner сводит оба режима в нормализованный стор.
 */
export type IngestionStrategy<E> =
  | {
      readonly mode: 'push';
      readonly subscribe: (account: ChannelAccount, sink: Sink<E>) => Promise<Unsubscribe>;
      /**
       * Дерегистрация по аккаунту (идемпотентно, без живого замыкания) — для disconnect.
       * Для вебхук-площадок subscribe = регистрация URL у площадки, unsubscribe = снятие.
       */
      readonly unsubscribe?: (account: ChannelAccount) => Promise<void>;
    }
  | {
      readonly mode: 'poll';
      readonly intervalSec: number;
      readonly poll: (account: ChannelAccount, cursor: Cursor) => ResultAsync<PollResult<E>, ChannelError>;
    }
  | { readonly mode: 'none' };

/** Публикация листингов: фид (Cian/Avito) или API. */
export type ListingPublisher = {
  readonly buildFeed: (listings: readonly ListingInput[]) => Result<FeedDocument, ChannelError>;
};

/** Цены по датам (Avito) либо базовая через перевыкладку фида (Cian). */
export type PriceSync = {
  readonly pushPrices: (link: ListingLink, updates: readonly PriceUpdate[]) => ResultAsync<void, ChannelError>;
};

export type AvailabilitySync = {
  readonly pushAvailability: (
    link: ListingLink,
    updates: readonly AvailabilityUpdate[],
  ) => ResultAsync<void, ChannelError>;
};

export type MessagingChannel = {
  readonly ingest: IngestionStrategy<ChannelMessage>;
  /** Ответ в конкретный тред (chat) площадки. account несёт orgId/креды, threadId — внешний chatId. */
  readonly send?: (account: ChannelAccount, threadId: string, text: string) => ResultAsync<void, ChannelError>;
};

export type BookingSource = {
  readonly ingest: IngestionStrategy<ExternalBooking>;
};

export type RawWebhookRequest = {
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
};

/**
 * Обратная связь по публикации — симметрия IngestionStrategy, но для исходящего:
 * как узнать, что площадка реально применила выложенный контент.
 * Cian → poll (get-order/get-my-offers); Avito → webhook модерации; без фидбэка → none.
 */
export type PublishFeedback =
  | {
      readonly mode: 'poll';
      readonly intervalSec: number;
      readonly poll: (account: ChannelAccount) => ResultAsync<readonly PublishConfirmation[], ChannelError>;
    }
  | {
      readonly mode: 'webhook';
      readonly parse: (req: RawWebhookRequest) => Result<readonly PublishConfirmation[], ChannelError>;
    }
  | { readonly mode: 'sync' }
  | { readonly mode: 'none' };

/**
 * whoami площадки: по кредам аккаунта вернуть стабильный id аккаунта НА площадке.
 * Это то, что фиксирует реестр привязок (анти-абьюз). Опционально: площадка без такого
 * метода не участвует в привязке — деградируем мягко (привязки нет, остальное работает).
 *  - Avito: id из профиля OAuth (`GET /core/v1/accounts/self`);
 *  - Cian: id аккаунта, к которому выдан access key.
 */
export type AccountIdentity = {
  readonly identify: (account: ChannelAccount) => ResultAsync<ExternalAccountIdentity, ChannelError>;
};

export type WebhookParser = {
  /** Проверка подписи вебхука (нужен account — секрет берётся из vault; асинхронно). */
  readonly verify: (account: ChannelAccount, req: RawWebhookRequest) => ResultAsync<void, ChannelError>;
  readonly parse: (req: RawWebhookRequest) => Result<readonly ChannelEvent[], ChannelError>;
};

/**
 * Адаптер площадки: декларирует возможности и реализует подмножество портов.
 * Опциональные порты = «не поддерживается этой площадкой».
 */
export type ChannelAdapter = {
  readonly platform: Platform;
  readonly capabilities: ChannelCapabilities;
  readonly publisher?: ListingPublisher;
  readonly priceSync?: PriceSync;
  readonly availabilitySync?: AvailabilitySync;
  readonly bookings?: BookingSource;
  readonly messaging?: MessagingChannel;
  readonly webhook?: WebhookParser;
  readonly publishFeedback?: PublishFeedback;
  /** whoami для анти-абьюза привязки аккаунтов (опционально). */
  readonly identity?: AccountIdentity;
};
