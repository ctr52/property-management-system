/**
 * Realtime-хаб: транспортный pub/sub для проброса событий подключённым клиентам (SSE/WS),
 * изолированный по орге (tenant). В отличие от доменной EventBus (клей между модулями),
 * это «край» (imperative shell) — несёт непрозрачный JSON-конверт, домена не знает.
 *
 * Доставка at-most-once, in-process. При выносе в несколько инстансов адаптер заменяется
 * на брокер (Redis pub/sub и т.п.) за тем же портом — потребители не меняются.
 */
export type RealtimeEnvelope = {
  readonly event: string;
  readonly data: unknown;
};

export type RealtimeListener = (envelope: RealtimeEnvelope) => void;

export type RealtimeHub = {
  readonly publish: (orgId: string, envelope: RealtimeEnvelope) => void;
  /** Подписка; возвращает функцию отписки (обязательна — иначе утечка на каждом SSE-коннекте). */
  readonly subscribe: (orgId: string, listener: RealtimeListener) => () => void;
};

export const createInMemoryRealtimeHub = (): RealtimeHub => {
  const topics = new Map<string, Set<RealtimeListener>>();
  return {
    publish: (orgId, envelope) => {
      for (const listener of topics.get(orgId) ?? []) {
        try {
          listener(envelope);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('realtime listener failed', error);
        }
      }
    },
    subscribe: (orgId, listener) => {
      const set = topics.get(orgId) ?? new Set<RealtimeListener>();
      set.add(listener);
      topics.set(orgId, set);
      return () => {
        const current = topics.get(orgId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) topics.delete(orgId);
      };
    },
  };
};
