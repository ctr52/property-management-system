import type { ChannelAccount, ChannelEvent, ChannelMessage, Cursor, ExternalBooking } from '../domain/types';
import type { ChannelAdapter, IngestionStrategy, Sink } from '../ports/adapter';
import type { Scheduler } from '../ports/repos';

export type IngestionDeps = {
  readonly scheduler: Scheduler;
  /**
   * Единая проекция нормализованного события в домен (идемпотентно). Та же функция, что и у
   * push-вебхука (`ingestChannelEvent`) — поэтому push и poll сходятся в одну точку.
   */
  readonly handle: (account: ChannelAccount, event: ChannelEvent) => Promise<void>;
};

/**
 * Унификация push/poll: и вебхук, и поллинг сводятся к одному sink,
 * который кладёт нормализованные события в стор. Потребитель различий не видит.
 */
const runStrategy = <E>(
  deps: IngestionDeps,
  account: ChannelAccount,
  strategy: IngestionStrategy<E>,
  toEvent: (item: E) => ChannelEvent,
): void => {
  if (strategy.mode === 'none') {
    return;
  }

  const sink: Sink<E> = async (items) => {
    for (const item of items) {
      await deps.handle(account, toEvent(item));
    }
  };

  if (strategy.mode === 'push') {
    void strategy.subscribe(account, sink);
    return;
  }

  // poll: единый луп, курсор продвигается по успешным выборкам
  let cursor: Cursor = null;
  deps.scheduler.every(strategy.intervalSec, async () => {
    const result = await strategy.poll(account, cursor);
    if (result.isOk()) {
      await sink(result.value.events);
      cursor = result.value.cursor;
    }
  });
};

/** Запускает приём сообщений и броней для аккаунта по возможностям его адаптера. */
export const startIngestion =
  (deps: IngestionDeps) =>
  (account: ChannelAccount, adapter: ChannelAdapter): void => {
    if (adapter.messaging) {
      runStrategy<ChannelMessage>(deps, account, adapter.messaging.ingest, (payload) => ({
        type: 'message',
        payload,
      }));
    }
    if (adapter.bookings) {
      runStrategy<ExternalBooking>(deps, account, adapter.bookings.ingest, (payload) => ({
        type: 'booking',
        payload,
      }));
    }
  };
