import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { notifications } from '../../../db/schema';
import type { StoredNotification } from '../domain/types';
import type { NotificationRepo } from '../ports';

type Row = typeof notifications.$inferSelect;

const toDomain = (row: Row): StoredNotification => ({
  id: row.id,
  orgId: row.orgId,
  userId: row.userId,
  type: row.type,
  title: row.title,
  body: row.body,
  read: row.read,
  idempotencyKey: row.idempotencyKey ?? '',
  createdAt: row.createdAt.toISOString(),
});

export const createDrizzleNotificationRepo = (db: Db): NotificationRepo => ({
  saveIfNew: async (n) => {
    await db
      .insert(notifications)
      .values({
        id: n.id,
        orgId: n.orgId,
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.read,
        idempotencyKey: n.idempotencyKey,
        createdAt: new Date(n.createdAt),
      })
      .onConflictDoNothing({ target: notifications.idempotencyKey });
  },
  listByUser: async (orgId, userId) => {
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId)))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    return rows.map(toDomain);
  },
  markRead: async (orgId, userId, id) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), eq(notifications.id, id)));
  },
  markAllRead: async (orgId, userId) => {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId)));
  },
});
