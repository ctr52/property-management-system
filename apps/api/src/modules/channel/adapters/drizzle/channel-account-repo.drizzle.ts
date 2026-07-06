import { eq } from 'drizzle-orm';
import type { Db } from '../../../../db/client';
import { channelAccounts } from '../../../../db/schema';
import type { ChannelAccount, Platform } from '../../domain/types';
import type { ChannelAccountRepo } from '../../ports/repos';

type Row = typeof channelAccounts.$inferSelect;

const toDomain = (row: Row): ChannelAccount => ({
  id: row.id,
  orgId: row.orgId,
  platform: row.platform as Platform,
  status: row.status as ChannelAccount['status'],
  credentialsRef: row.credentialsRef,
  createdAt: row.createdAt.toISOString(),
});

export const createDrizzleChannelAccountRepo = (db: Db): ChannelAccountRepo => ({
  getById: async (id) => {
    const rows = await db.select().from(channelAccounts).where(eq(channelAccounts.id, id));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  listByOrg: async (orgId) => {
    const rows = await db.select().from(channelAccounts).where(eq(channelAccounts.orgId, orgId));
    return rows.map(toDomain);
  },
  listAll: async () => {
    const rows = await db.select().from(channelAccounts);
    return rows.map(toDomain);
  },
  save: async (account) => {
    const values = {
      id: account.id,
      orgId: account.orgId,
      platform: account.platform,
      status: account.status,
      credentialsRef: account.credentialsRef,
      createdAt: new Date(account.createdAt),
    };
    await db
      .insert(channelAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: channelAccounts.id,
        set: { status: values.status, credentialsRef: values.credentialsRef },
      });
  },
  remove: async (id) => {
    await db.delete(channelAccounts).where(eq(channelAccounts.id, id));
  },
});
