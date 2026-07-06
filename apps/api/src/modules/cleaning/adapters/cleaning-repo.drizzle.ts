import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { cleaningTasks } from '../../../db/schema';
import type { CleaningStatus, CleaningTask } from '../domain/types';
import type { CleaningTaskRepo } from '../ports';

type Row = typeof cleaningTasks.$inferSelect;

const toDomain = (row: Row): CleaningTask => ({
  id: row.id,
  orgId: row.orgId,
  propertyId: row.propertyId,
  reservationId: row.reservationId,
  date: row.date,
  status: row.status as CleaningStatus,
  assigneeId: row.assigneeId,
  guestName: row.guestName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toValues = (t: CleaningTask) => ({
  id: t.id,
  orgId: t.orgId,
  propertyId: t.propertyId,
  reservationId: t.reservationId,
  date: t.date,
  status: t.status,
  assigneeId: t.assigneeId,
  guestName: t.guestName,
  createdAt: new Date(t.createdAt),
  updatedAt: new Date(t.updatedAt),
});

export const createDrizzleCleaningRepo = (db: Db): CleaningTaskRepo => ({
  save: async (task) => {
    const values = toValues(task);
    await db
      .insert(cleaningTasks)
      .values(values)
      .onConflictDoUpdate({
        target: cleaningTasks.id,
        set: { status: values.status, assigneeId: values.assigneeId, updatedAt: values.updatedAt },
      });
  },
  getById: async (orgId, id) => {
    const rows = await db
      .select()
      .from(cleaningTasks)
      .where(and(eq(cleaningTasks.orgId, orgId), eq(cleaningTasks.id, id)));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  getByReservationId: async (reservationId) => {
    const rows = await db.select().from(cleaningTasks).where(eq(cleaningTasks.reservationId, reservationId));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  listByOrg: async (orgId) => {
    const rows = await db.select().from(cleaningTasks).where(eq(cleaningTasks.orgId, orgId));
    return rows.map(toDomain);
  },
  listByAssignee: async (orgId, assigneeId) => {
    const rows = await db
      .select()
      .from(cleaningTasks)
      .where(and(eq(cleaningTasks.orgId, orgId), eq(cleaningTasks.assigneeId, assigneeId)));
    return rows.map(toDomain);
  },
  listOpenWithReservation: async () => {
    const rows = await db
      .select()
      .from(cleaningTasks)
      .where(and(isNotNull(cleaningTasks.reservationId), inArray(cleaningTasks.status, ['todo', 'assigned'])));
    return rows.map(toDomain);
  },
});
