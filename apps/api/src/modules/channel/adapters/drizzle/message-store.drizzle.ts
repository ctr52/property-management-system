import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../../db/client';
import { channelMessages, channelThreads } from '../../../../db/schema';
import type { Platform } from '../../domain/types';
import type { MessageStore, StoredMessage, ThreadStore } from '../../ports/repos';

type Row = typeof channelMessages.$inferSelect;

const toStored = (row: Row, threadId: string): StoredMessage => ({
  platform: row.platform as Platform,
  externalThreadId: row.externalThreadId,
  externalMessageId: row.externalMessageId,
  direction: row.direction as 'in' | 'out',
  text: row.text,
  sentAt: row.sentAt.toISOString(),
  orgId: row.orgId,
  threadId,
  receivedAt: row.receivedAt.toISOString(),
});

/**
 * Персистентный unified inbox: сообщения переживают рестарт. Каждое сообщение принадлежит
 * нашему диалогу (threadId), который маппится на тред площадки через ThreadStore.
 */
export const createDrizzleMessageStore = (db: Db, threads: ThreadStore): MessageStore => ({
  append: async (orgId, message): Promise<StoredMessage> => {
    const threadId = await threads.ensure(orgId, message.platform, message.externalThreadId);
    const receivedAt = new Date();
    await db.insert(channelMessages).values({
      id: randomUUID(),
      orgId,
      platform: message.platform,
      externalThreadId: message.externalThreadId,
      externalMessageId: message.externalMessageId,
      direction: message.direction,
      text: message.text,
      sentAt: new Date(message.sentAt),
      receivedAt,
    });
    return {
      ...message,
      orgId,
      threadId,
      receivedAt: receivedAt.toISOString(),
    };
  },
  listByOrg: async (orgId) => {
    // INNER JOIN: диалог гарантированно есть (ensure на append + backfill на старте).
    const rows = await db
      .select({ message: channelMessages, threadId: channelThreads.id })
      .from(channelMessages)
      .innerJoin(
        channelThreads,
        and(
          eq(channelMessages.orgId, channelThreads.orgId),
          eq(channelMessages.platform, channelThreads.platform),
          eq(channelMessages.externalThreadId, channelThreads.externalThreadId),
        ),
      )
      .where(eq(channelMessages.orgId, orgId))
      .orderBy(desc(channelMessages.receivedAt))
      .limit(200);
    return rows.map((r) => toStored(r.message, r.threadId));
  },
});
