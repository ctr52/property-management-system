import { eq } from 'drizzle-orm';
import type { Db } from '../../../../db/client';
import { channelInbox } from '../../../../db/schema';
import type { InboxRepo } from '../../ports/repos';

/**
 * Персистентный дедуп входящих событий каналов. Ключ идемпотентности живёт в БД —
 * повторный вебхук/поллинг после рестарта не задвоит сообщение или бронь.
 */
export const createDrizzleInboxRepo = (db: Db): InboxRepo => ({
  append: async (idempotencyKey) => {
    const existing = await db
      .select({ key: channelInbox.key })
      .from(channelInbox)
      .where(eq(channelInbox.key, idempotencyKey));
    if (existing.length > 0) return { deduped: true };
    // onConflictDoNothing страхует гонку при одновременном приёме того же ключа.
    await db.insert(channelInbox).values({ key: idempotencyKey, createdAt: new Date() }).onConflictDoNothing();
    return { deduped: false };
  },
});
