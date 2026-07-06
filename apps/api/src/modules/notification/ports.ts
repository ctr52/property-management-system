import type { OutboundNotification, StoredNotification } from './domain/types';

export type NotificationRepo = {
  /** Сохранить, если ключ идемпотентности новый (дедуп повторных событий). */
  readonly saveIfNew: (notification: StoredNotification) => Promise<void>;
  readonly listByUser: (orgId: string, userId: string) => Promise<StoredNotification[]>;
  readonly markRead: (orgId: string, userId: string, id: string) => Promise<void>;
  readonly markAllRead: (orgId: string, userId: string) => Promise<void>;
};

/**
 * Канал доставки (capability-адаптер): in_app / email / push. Каждый сам решает, как доставить
 * и как дедупить. Добавить канал = новый адаптер + регистрация, без правок политики.
 */
export type NotificationChannel = {
  readonly id: string;
  readonly deliver: (notification: OutboundNotification) => Promise<void>;
};

export type NotificationChannelRegistry = {
  readonly get: (id: string) => NotificationChannel | undefined;
};

/** Резолв получателей (реализуется в composition root поверх Identity). */
export type RecipientResolver = {
  /** Сотрудники организации (owner/manager) — для общих уведомлений. */
  readonly staffOf: (orgId: string) => Promise<string[]>;
  readonly emailOf: (userId: string) => Promise<string | null>;
};
