/** Хранимое in-app уведомление. */
export type StoredNotification = {
  readonly id: string;
  readonly orgId: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly read: boolean;
  readonly idempotencyKey: string;
  readonly createdAt: string;
};

/** Исходящее уведомление — то, что доставляет канал (in-app/email/push). */
export type OutboundNotification = {
  readonly orgId: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  /** Ключ идемпотентности доставки (дедуп при повторе события). */
  readonly key: string;
};
