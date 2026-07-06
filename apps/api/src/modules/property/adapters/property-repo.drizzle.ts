import { and, eq } from 'drizzle-orm';
import type { Property } from '@pms/shared';
import type { Db } from '../../../db/client';
import { properties } from '../../../db/schema';
import type { PropertyRepo } from '../ports/property-repo';

type Row = typeof properties.$inferSelect;

const toDomain = (row: Row): Property => ({
  id: row.id,
  orgId: row.orgId,
  title: row.title,
  address: row.address,
  basePriceMinor: row.basePriceMinor,
  currency: row.currency,
  checkInTime: row.checkInTime,
  checkOutTime: row.checkOutTime,
  createdAt: row.createdAt.toISOString(),
});

/** Drizzle/PGlite-реализация порта PropertyRepo. */
export const createDrizzlePropertyRepo = (db: Db): PropertyRepo => ({
  list: async (orgId) => {
    const rows = await db.select().from(properties).where(eq(properties.orgId, orgId));
    return rows.map(toDomain);
  },
  getById: async (orgId, id) => {
    const rows = await db
      .select()
      .from(properties)
      .where(and(eq(properties.orgId, orgId), eq(properties.id, id)));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  save: async (property) => {
    const values = {
      id: property.id,
      orgId: property.orgId,
      title: property.title,
      address: property.address,
      basePriceMinor: property.basePriceMinor,
      currency: property.currency,
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      createdAt: new Date(property.createdAt),
    };
    await db
      .insert(properties)
      .values(values)
      .onConflictDoUpdate({
        target: properties.id,
        set: {
          title: values.title,
          address: values.address,
          basePriceMinor: values.basePriceMinor,
          currency: values.currency,
          checkInTime: values.checkInTime,
          checkOutTime: values.checkOutTime,
        },
      });
  },
});
