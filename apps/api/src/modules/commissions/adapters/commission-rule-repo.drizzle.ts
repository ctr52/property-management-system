import { eq } from 'drizzle-orm';
import type { CommissionRule, ReservationSource } from '@pms/shared';
import type { Db } from '../../../db/client';
import { commissionRules } from '../../../db/schema';
import type { CommissionRuleRepo } from '../ports/repos';

type Row = typeof commissionRules.$inferSelect;

const toDomain = (row: Row): CommissionRule => ({
  source: row.source as ReservationSource,
  percentBips: row.percentBips,
  fixedMinor: row.fixedMinor,
});

const idOf = (orgId: string, source: ReservationSource) => `${orgId}:${source}`;

export const createDrizzleCommissionRuleRepo = (db: Db): CommissionRuleRepo => ({
  listByOrg: async (orgId) => {
    const rows = await db.select().from(commissionRules).where(eq(commissionRules.orgId, orgId));
    return rows.map(toDomain);
  },
  set: async (orgId, rule) => {
    await db
      .insert(commissionRules)
      .values({
        id: idOf(orgId, rule.source),
        orgId,
        source: rule.source,
        percentBips: rule.percentBips,
        fixedMinor: rule.fixedMinor,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: commissionRules.id,
        set: { percentBips: rule.percentBips, fixedMinor: rule.fixedMinor, updatedAt: new Date() },
      });
  },
});
