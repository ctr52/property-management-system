import type { AccountBindingRecord } from '../domain/account-binding';
import type {
  ChannelAccount,
  ChannelEvent,
  ChannelMessage,
  FeedDocument,
  ListingInput,
  ListingLink,
  Platform,
} from '../domain/types';
import type { ChannelAdapter } from './adapter';

/** Нормализованное сообщение в сторе (unified inbox). `threadId` — НАШ внутренний id диалога. */
export type StoredMessage = ChannelMessage & {
  readonly orgId: string;
  /** Внутренний id диалога (маппится на platform+externalThreadId через ThreadStore). */
  readonly threadId: string;
  readonly receivedAt: string;
};

export type MessageStore = {
  /** Возвращает сохранённое сообщение (с внутренним threadId) — нужно realtime-проекции. */
  readonly append: (orgId: string, message: ChannelMessage) => Promise<StoredMessage>;
  readonly listByOrg: (orgId: string) => Promise<StoredMessage[]>;
};

/** Диалог: наш внутренний id ↔ реальный тред площадки. */
export type ChannelThread = {
  readonly id: string;
  readonly orgId: string;
  readonly platform: Platform;
  readonly externalThreadId: string;
};

/**
 * Маппинг диалогов. `ensure` идемпотентен по (orgId, platform, externalThreadId) и возвращает
 * наш внутренний id; `get` резолвит внутренний id обратно в тред площадки (нужно для ответа).
 */
export type ThreadStore = {
  readonly ensure: (orgId: string, platform: Platform, externalThreadId: string) => Promise<string>;
  readonly get: (orgId: string, threadId: string) => Promise<ChannelThread | null>;
  /** Достроить недостающие диалоги по уже накопленным сообщениям (idempotent backfill). */
  readonly backfillFromMessages: () => Promise<void>;
};

export type ChannelAccountRepo = {
  readonly getById: (id: string) => Promise<ChannelAccount | null>;
  readonly listByOrg: (orgId: string) => Promise<ChannelAccount[]>;
  readonly listAll: () => Promise<ChannelAccount[]>;
  readonly save: (account: ChannelAccount) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
};

/**
 * Глобальный (cross-tenant) реестр привязок реальных аккаунтов площадок: `(platform,
 * externalAccountId) → orgId`. Анти-абьюз: не даём увести чужой подтверждённый аккаунт и
 * освободить его под новый триал. Живёт ВНЕ tenant-скоупа (намеренно cross-org). Правила —
 * чистые (domain/account-binding); этот порт — только хранилище.
 */
export type ExternalAccountRegistry = {
  readonly find: (platform: Platform, externalAccountId: string) => Promise<AccountBindingRecord | null>;
  /** Идемпотентно по (platform, externalAccountId). Вызывается, когда decideAccountBinding=bind. */
  readonly bind: (record: AccountBindingRecord) => Promise<void>;
  /** Снять привязку. Только когда decideDetach=allow (подписка оплачена). */
  readonly release: (platform: Platform, externalAccountId: string) => Promise<void>;
};

/** Хранилище секретов (API-ключи площадок). Возвращает ссылку (ref), а не секрет. */
export type SecretVault = {
  readonly put: (secret: Readonly<Record<string, string>>) => Promise<string>;
  readonly get: (ref: string) => Promise<Record<string, string> | null>;
};

export type ListingLinkRepo = {
  readonly listByProperty: (orgId: string, propertyId: string) => Promise<ListingLink[]>;
  readonly listManagedByOrgPlatform: (orgId: string, platform: Platform) => Promise<ListingLink[]>;
  readonly getByPropertyPlatform: (
    orgId: string,
    propertyId: string,
    platform: Platform,
  ) => Promise<ListingLink | null>;
  /** Поиск связи по внешнему id листинга — нужен Reconciler'у для сведе́ния подтверждений. */
  readonly getByExternalId: (
    orgId: string,
    platform: Platform,
    externalId: string,
  ) => Promise<ListingLink | null>;
  /** Поиск связи по id листинга НА площадке — резолв объекта по входящей броне. */
  readonly getByPlatformListingId: (
    orgId: string,
    platform: Platform,
    platformListingId: string,
  ) => Promise<ListingLink | null>;
  readonly save: (link: ListingLink) => Promise<void>;
  readonly remove: (orgId: string, id: string) => Promise<void>;
};

/** Проверка существования объекта без зависимости от модуля Properties. */
export type PropertyLookup = {
  readonly exists: (orgId: string, propertyId: string) => Promise<boolean>;
};

/** Хостинг фида: храним тело под ключом аккаунта, площадка тянет его pull'ом. */
export type FeedHost = {
  readonly put: (accountId: string, doc: FeedDocument) => Promise<void>;
  readonly get: (accountId: string) => Promise<FeedDocument | null>;
};

/** Идемпотентный приём входящих событий (inbox). */
export type InboxRepo = {
  readonly append: (idempotencyKey: string, event: ChannelEvent) => Promise<{ deduped: boolean }>;
};

/**
 * Источник нормализованных листингов для публикации.
 * Реализуется в composition root поверх модуля Properties — модуль channel
 * не зависит от модуля property напрямую.
 */
export type ListingSource = {
  readonly listManagedForPlatform: (orgId: string, platform: Platform) => Promise<ListingInput[]>;
};

/** Реестр адаптеров по платформам. */
export type AdapterRegistry = {
  readonly get: (platform: Platform) => ChannelAdapter | null;
};

/** Планировщик для poll-режима Ingestion Runner. */
export type Scheduler = {
  readonly every: (intervalSec: number, task: () => Promise<void>) => void;
};

/** Занятый интервал объекта (для синка доступности в каналы). */
export type OccupancySlot = {
  readonly propertyId: string;
  readonly from: string;
  readonly to: string;
};

/**
 * Источник занятости для канального синка — реализуется в composition root поверх модуля
 * Availability (holdRepo). Channel-модуль не зависит от Availability напрямую.
 */
export type OccupancySource = {
  readonly listForRange: (orgId: string, from: string, to: string) => Promise<OccupancySlot[]>;
};

/** Задача синка доступности объекта в каналы. */
export type AvailabilitySyncTask = {
  readonly id: string;
  readonly orgId: string;
  readonly propertyId: string;
  readonly attempts: number;
};

/**
 * Durable outbox синка доступности (at-least-once вместо fire-and-forget). На availability.changed
 * кладём задачу (идемпотентно: один pending-таск на объект), воркер дренирует с ретраями/backoff.
 * Гарантирует, что проекция занятости дойдёт до площадок даже после падения процесса — закрывает
 * окно overbooking из каналов.
 */
export type AvailabilitySyncOutbox = {
  readonly enqueue: (orgId: string, propertyId: string, at: string) => Promise<void>;
  readonly claimDue: (now: string, limit: number) => Promise<AvailabilitySyncTask[]>;
  readonly markDone: (id: string) => Promise<void>;
  readonly markFailed: (id: string, nextAttemptAt: string, error: string) => Promise<void>;
};
