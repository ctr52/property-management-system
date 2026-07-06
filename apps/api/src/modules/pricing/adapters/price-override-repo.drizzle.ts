import { and, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { priceOverrides } from '../../../db/schema';
import type { PriceOverride } from '../domain/types';
import type { PriceOverrideRepo } from '../ports/price-override-repo';

type Row = typeof priceOverrides.$inferSelect;

const toDomain = (row: Row): PriceOverride => ({
  orgId: row.orgId,
  propertyId: row.propertyId,
  date: row.date,
  amountMinor: row.amountMinor,
});

const idOf = (orgId: string, propertyId: string, date: string) => `${orgId}:${propertyId}:${date}`;

export const createDrizzlePriceOverrideRepo = (db: Db): PriceOverrideRepo => ({
  listByProperty: async (orgId, propertyId) => {
    const rows = await db
      .select()
      .from(priceOverrides)
      .where(and(eq(priceOverrides.orgId, orgId), eq(priceOverrides.propertyId, propertyId)));
    return rows.map(toDomain);
  },
  listForOrgRange: async (orgId, from, to) => {
    const rows = await db
      .select()
      .from(priceOverrides)
      .where(and(eq(priceOverrides.orgId, orgId), gte(priceOverrides.date, from), lte(priceOverrides.date, to)));
    return rows.map(toDomain);
  },
  set: async (o) => {
    await db
      .insert(priceOverrides)
      .values({
        id: idOf(o.orgId, o.propertyId, o.date),
        orgId: o.orgId,
        propertyId: o.propertyId,
        date: o.date,
        amountMinor: o.amountMinor,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: priceOverrides.id,
        set: { amountMinor: o.amountMinor, updatedAt: new Date() },
      });
  },
  remove: async (orgId, propertyId, date) => {
    await db.delete(priceOverrides).where(eq(priceOverrides.id, idOf(orgId, propertyId, date)));
  },
});
