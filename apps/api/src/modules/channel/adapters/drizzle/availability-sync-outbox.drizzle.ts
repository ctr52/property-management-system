import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Db } from '../../../../db/client';
import { availabilitySyncOutbox } from '../../../../db/schema';
import type { AvailabilitySyncOutbox, AvailabilitySyncTask } from '../../ports/repos';

type Row = typeof availabilitySyncOutbox.$inferSelect;

const toTask = (row: Row): AvailabilitySyncTask => ({
  id: row.id,
  orgId: row.orgId,
  propertyId: row.propertyId,
  attempts: row.attempts,
});

/**
 * Durable outbox в той же БД (портируемо на серверный Postgres, без Redis).
 * Дедуп: id = `${orgId}:${propertyId}` — новая правда по объекту переустанавливает один таск
 * и снимает backoff (attempts → 0), чтобы свежее изменение синкнулось без задержки.
 */
export const createDrizzleAvailabilitySyncOutbox = (db: Db): AvailabilitySyncOutbox => ({
  enqueue: async (orgId, propertyId, at) => {
    await db
      .insert(availabilitySyncOutbox)
      .values({
        id: `${orgId}:${propertyId}`,
        orgId,
        propertyId,
        attempts: 0,
        nextAttemptAt: new Date(at),
        lastError: null,
        createdAt: new Date(at),
      })
      .onConflictDoUpdate({
        target: availabilitySyncOutbox.id,
        set: { attempts: 0, nextAttemptAt: new Date(at), lastError: null },
      });
  },

  claimDue: async (now, limit) => {
    const rows = await db
      .select()
      .from(availabilitySyncOutbox)
      .where(lte(availabilitySyncOutbox.nextAttemptAt, new Date(now)))
      .orderBy(asc(availabilitySyncOutbox.nextAttemptAt))
      .limit(limit);
    return rows.map(toTask);
  },

  markDone: async (id) => {
    await db.delete(availabilitySyncOutbox).where(eq(availabilitySyncOutbox.id, id));
  },

  markFailed: async (id, nextAttemptAt, error) => {
    await db
      .update(availabilitySyncOutbox)
      .set({
        attempts: sql`${availabilitySyncOutbox.attempts} + 1`,
        nextAttemptAt: new Date(nextAttemptAt),
        lastError: error,
      })
      .where(and(eq(availabilitySyncOutbox.id, id)));
  },
});
