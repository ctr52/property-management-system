import type { Clock } from '../../../shared/ports';
import type { EventBus } from '../../../shared/event-bus';
import type { AvailabilityUpdate } from '../domain/types';
import type {
  AdapterRegistry,
  AvailabilitySyncOutbox,
  ListingLinkRepo,
  OccupancySource,
  Scheduler,
} from '../ports/repos';

const DAY_MS = 86_400_000;
const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const startOfTodayUtc = (): number => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

// Экспоненциальный backoff с потолком: 30s, 60s, 120s, … ≤ 1h.
const BASE_BACKOFF_SEC = 30;
const MAX_BACKOFF_SEC = 3600;
const backoffSec = (attempts: number): number =>
  Math.min(MAX_BACKOFF_SEC, BASE_BACKOFF_SEC * 2 ** attempts);

// ---- Подписчик: availability.changed → durable enqueue (быстро, без IO в каналы) ----

export type AvailabilitySyncEnqueueDeps = {
  readonly bus: EventBus;
  readonly outbox: AvailabilitySyncOutbox;
  readonly clock: Clock;
};

/**
 * Подписка на availability.changed: только ставит задачу в outbox. Реальная отправка в каналы —
 * в воркере (durable, с ретраями). Падение процесса между коммитом hold и пушем больше не теряет
 * синхронизацию — задача переживёт рестарт в БД.
 */
export const startAvailabilitySync =
  (deps: AvailabilitySyncEnqueueDeps) =>
  (): void => {
    deps.bus.subscribe('availability.changed', async ({ orgId, propertyId }) => {
      await deps.outbox.enqueue(orgId, propertyId, deps.clock.now().toISOString());
    });
  };

// ---- Воркер: дренирует outbox и пушит доступность в per-date каналы ----

export type AvailabilitySyncWorkerDeps = {
  readonly scheduler: Scheduler;
  readonly outbox: AvailabilitySyncOutbox;
  readonly occupancy: OccupancySource;
  readonly links: ListingLinkRepo;
  readonly registry: AdapterRegistry;
  readonly clock: Clock;
  readonly windowDays: number;
  readonly intervalSec: number;
  readonly batchSize: number;
  /** После стольких неудач задачу снимаем (чтобы не крутить вечно). */
  readonly maxAttempts: number;
};

/** Пересчёт desired-доступности объекта на окно вперёд из занятых интервалов. */
const computeUpdates = (
  slots: readonly { from: string; to: string }[],
  windowDays: number,
): AvailabilityUpdate[] => {
  const startMs = startOfTodayUtc();
  const updates: AvailabilityUpdate[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    const date = isoDate(startMs + i * DAY_MS);
    const occupied = slots.some((s) => s.from <= date && date < s.to);
    updates.push({ date, available: !occupied });
  }
  return updates;
};

/**
 * Воркер синка доступности: на каждом тике берёт «дозревшие» задачи и пушит занятость в каналы,
 * умеющие per-date (Avito). Cian (availabilitySync='none') пропускается — мягкая деградация.
 * Успех всех пушей → задача снята; любая ошибка → backoff и повтор; превышение maxAttempts → снимаем.
 * Идемпотентно: пушим полное desired-состояние окна, повтор безопасен.
 */
export const startAvailabilitySyncWorker =
  (deps: AvailabilitySyncWorkerDeps) =>
  (): void => {
    deps.scheduler.every(deps.intervalSec, async () => {
      const now = deps.clock.now().toISOString();
      const tasks = await deps.outbox.claimDue(now, deps.batchSize);

      for (const task of tasks) {
        const startMs = startOfTodayUtc();
        const from = isoDate(startMs);
        const to = isoDate(startMs + deps.windowDays * DAY_MS);
        const slots = (await deps.occupancy.listForRange(task.orgId, from, to)).filter(
          (s) => s.propertyId === task.propertyId,
        );
        const updates = computeUpdates(slots, deps.windowDays);

        let failure: string | null = null;
        for (const link of await deps.links.listByProperty(task.orgId, task.propertyId)) {
          if (!link.platformListingId) continue;
          const adapter = deps.registry.get(link.platform);
          if (!adapter?.availabilitySync || adapter.capabilities.availabilitySync !== 'per-date') {
            continue;
          }
          const result = await adapter.availabilitySync.pushAvailability(link, updates);
          if (result.isErr()) failure = result.error.message;
        }

        if (failure === null) {
          await deps.outbox.markDone(task.id);
        } else if (task.attempts + 1 >= deps.maxAttempts) {
          // eslint-disable-next-line no-console
          console.error(
            `availability-sync: giving up on ${task.id} after ${task.attempts + 1} attempts: ${failure}`,
          );
          await deps.outbox.markDone(task.id);
        } else {
          const next = new Date(
            deps.clock.now().getTime() + backoffSec(task.attempts) * 1000,
          ).toISOString();
          await deps.outbox.markFailed(task.id, next, failure);
        }
      }
    });
  };
