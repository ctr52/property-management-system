import type { ChannelAccount, ChannelEvent, ExternalBooking } from '../domain/types';
import type { InboxRepo, MessageStore } from '../ports/repos';

export type IngestEventDeps = {
  readonly inbox: InboxRepo;
  readonly messages: MessageStore;
  /** Приём брони (реализуется в composition root поверх Reservations). Идемпотентен сам. */
  readonly ingestBooking: (orgId: string, booking: ExternalBooking) => Promise<void>;
};

/**
 * ЕДИНАЯ проекция нормализованного события канала в домен — единственная точка, где входящее
 * (откуда бы ни пришло: push-вебхук через публичный роут или поллинг через Ingestion Runner)
 * ложится в сторы. Потребитель различий push/poll и площадки не видит.
 *
 * Идемпотентно:
 *  - сообщения — дедуп через inbox по (platform, externalMessageId);
 *  - брони — сам ingest идемпотентен по (source, externalId), отдельный дедуп не нужен.
 */
export const ingestChannelEvent =
  (deps: IngestEventDeps) =>
  async (account: ChannelAccount, event: ChannelEvent): Promise<void> => {
    if (event.type === 'message') {
      const key = `${account.platform}:msg:${event.payload.externalMessageId}`;
      const { deduped } = await deps.inbox.append(key, event);
      if (deduped) return;
      await deps.messages.append(account.orgId, event.payload);
    } else {
      await deps.ingestBooking(account.orgId, event.payload);
    }
  };

export type IngestChannelEvent = ReturnType<typeof ingestChannelEvent>;
