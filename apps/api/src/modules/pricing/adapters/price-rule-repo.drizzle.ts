import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { priceRules } from '../../../db/schema';
import type { PriceAdjustment, PricePredicate, PriceRule } from '../domain/types';
import type { PriceRuleRepo } from '../ports/price-rule-repo';

type Row = typeof priceRules.$inferSelect;

const toDomain = (row: Row): PriceRule => ({
  id: row.id,
  orgId: row.orgId,
  propertyId: row.propertyId,
  label: row.label,
  priority: row.priority,
  enabled: row.enabled,
  match: row.match as PricePredicate,
  adjustment: row.adjustment as PriceAdjustment,
});

export const createDrizzlePriceRuleRepo = (db: Db): PriceRuleRepo => ({
  listByProperty: async (orgId, propertyId) => {
    const rows = await db
      .select()
      .from(priceRules)
      .where(and(eq(priceRules.orgId, orgId), eq(priceRules.propertyId, propertyId)));
    return rows.map(toDomain);
  },
  listByOrg: async (orgId) => {
    const rows = await db.select().from(priceRules).where(eq(priceRules.orgId, orgId));
    return rows.map(toDomain);
  },
  getById: async (orgId, id) => {
    const rows = await db
      .select()
      .from(priceRules)
      .where(and(eq(priceRules.orgId, orgId), eq(priceRules.id, id)));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  save: async (rule) => {
    const values = {
      id: rule.id,
      orgId: rule.orgId,
      propertyId: rule.propertyId,
      label: rule.label,
      priority: rule.priority,
      enabled: rule.enabled,
      match: rule.match,
      adjustment: rule.adjustment,
      createdAt: new Date(),
    };
    await db
      .insert(priceRules)
      .values(values)
      .onConflictDoUpdate({
        target: priceRules.id,
        set: {
          label: values.label,
          priority: values.priority,
          enabled: values.enabled,
          match: values.match,
          adjustment: values.adjustment,
        },
      });
  },
  remove: async (orgId, id) => {
    await db.delete(priceRules).where(and(eq(priceRules.orgId, orgId), eq(priceRules.id, id)));
  },
});
