import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../../db/client';
import { channelMessages, channelThreads } from '../../../../db/schema';
import type { Platform } from '../../domain/types';
import type { ChannelThread, ThreadStore } from '../../ports/repos';

/**
 * Персистентный маппинг диалогов: наш внутренний id ↔ (platform, externalThreadId).
 * `ensure` идемпотентен через unique(orgId, platform, externalThreadId) + ON CONFLICT DO NOTHING.
 */
export const createDrizzleThreadStore = (db: Db): ThreadStore => {
  const ensure = async (orgId: string, platform: Platform, externalThreadId: string): Promise<string> => {
    await db
      .insert(channelThreads)
      .values({ id: randomUUID(), orgId, platform, externalThreadId, createdAt: new Date() })
      .onConflictDoNothing({
        target: [channelThreads.orgId, channelThreads.platform, channelThreads.externalThreadId],
      });
    const [row] = await db
      .select({ id: channelThreads.id })
      .from(channelThreads)
      .where(
        and(
          eq(channelThreads.orgId, orgId),
          eq(channelThreads.platform, platform),
          eq(channelThreads.externalThreadId, externalThreadId),
        ),
      )
      .limit(1);
    // row гарантированно есть: либо вставили, либо уже было.
    return row?.id ?? randomUUID();
  };

  return {
    ensure,
    get: async (orgId, threadId): Promise<ChannelThread | null> => {
      const [row] = await db
        .select()
        .from(channelThreads)
        .where(and(eq(channelThreads.orgId, orgId), eq(channelThreads.id, threadId)))
        .limit(1);
      return row
        ? { id: row.id, orgId: row.orgId, platform: row.platform as Platform, externalThreadId: row.externalThreadId }
        : null;
    },
    backfillFromMessages: async () => {
      // Достраиваем диалоги для уже накопленных сообщений (старые данные → стабильные id).
      const rows = await db
        .selectDistinct({
          orgId: channelMessages.orgId,
          platform: channelMessages.platform,
          externalThreadId: channelMessages.externalThreadId,
        })
        .from(channelMessages);
      for (const r of rows) {
        await ensure(r.orgId, r.platform as Platform, r.externalThreadId);
      }
    },
  };
};
