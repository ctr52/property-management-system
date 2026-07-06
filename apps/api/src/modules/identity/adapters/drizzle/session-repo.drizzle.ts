import { eq } from 'drizzle-orm';
import { sessions } from '../../../../db/schema';
import type { Db } from '../../../../db/client';
import type { Session } from '../../domain/types';
import type { SessionRepo } from '../../ports/repos';

type Row = typeof sessions.$inferSelect;

const toDomain = (row: Row): Session => ({
  id: row.id,
  userId: row.userId,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

export const createDrizzleSessionRepo = (db: Db): SessionRepo => ({
  save: async (session) => {
    await db.insert(sessions).values({
      id: session.id,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt),
      createdAt: new Date(session.createdAt),
    });
  },
  getById: async (id) => {
    const rows = await db.select().from(sessions).where(eq(sessions.id, id));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  delete: async (id) => {
    await db.delete(sessions).where(eq(sessions.id, id));
  },
});
