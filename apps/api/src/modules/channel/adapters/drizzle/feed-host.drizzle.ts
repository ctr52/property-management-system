import { eq } from 'drizzle-orm';
import type { Db } from '../../../../db/client';
import { channelFeeds } from '../../../../db/schema';
import type { FeedHost } from '../../ports/repos';

/** Персистентный хостинг фида: тело фида аккаунта переживает рестарт (площадка тянет его pull'ом). */
export const createDrizzleFeedHost = (db: Db): FeedHost => ({
  put: async (accountId, doc) => {
    await db
      .insert(channelFeeds)
      .values({ accountId, contentType: doc.contentType, body: doc.body, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: channelFeeds.accountId,
        set: { contentType: doc.contentType, body: doc.body, updatedAt: new Date() },
      });
  },
  get: async (accountId) => {
    const rows = await db.select().from(channelFeeds).where(eq(channelFeeds.accountId, accountId));
    const row = rows[0];
    return row ? { contentType: row.contentType, body: row.body } : null;
  },
});
