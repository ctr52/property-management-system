import { and, eq, gt, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { err, ok } from 'neverthrow';
import { type AppError, conflictError, notFoundError } from '../../../shared/errors';
import type { Db } from '../../../db/client';
import { availabilityHolds, properties } from '../../../db/schema';
import type { AvailabilityHold, HoldKind, HoldTier } from '../domain/types';
import type { HoldRepo, InsertResult } from '../ports/hold-repo';

type Row = typeof availabilityHolds.$inferSelect;

const toDomain = (row: Row): AvailabilityHold => ({
  id: row.id,
  orgId: row.orgId,
  propertyId: row.propertyId,
  from: row.fromDate,
  to: row.toDate,
  kind: row.kind as HoldKind,
  tier: row.tier as HoldTier,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  refId: row.refId,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

const insertValues = (hold: AvailabilityHold) => ({
  id: hold.id,
  orgId: hold.orgId,
  propertyId: hold.propertyId,
  fromDate: hold.from,
  toDate: hold.to,
  kind: hold.kind,
  tier: hold.tier,
  expiresAt: hold.expiresAt ? new Date(hold.expiresAt) : null,
  refId: hold.refId,
  note: hold.note,
  createdAt: new Date(hold.createdAt),
});

export const createDrizzleHoldRepo = (db: Db): HoldRepo => ({
  insertIfFree: (hold, now) =>
    db.transaction(async (tx) => {
      // Лок строки объекта → сериализация по объекту (на серверном Postgres; PGlite single-conn).
      const owner = await tx
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.id, hold.propertyId), eq(properties.orgId, hold.orgId)))
        .for('update');
      if (owner.length === 0) {
        return err<InsertResult, AppError>(notFoundError('Объект не найден'));
      }

      // Пересекающиеся АКТИВНЫЕ холды: firm ИЛИ tentative без срока ИЛИ tentative с expiresAt > now.
      const overlapping = await tx
        .select()
        .from(availabilityHolds)
        .where(
          and(
            eq(availabilityHolds.orgId, hold.orgId),
            eq(availabilityHolds.propertyId, hold.propertyId),
            lt(availabilityHolds.fromDate, hold.to),
            gt(availabilityHolds.toDate, hold.from),
            or(
              eq(availabilityHolds.tier, 'firm'),
              isNull(availabilityHolds.expiresAt),
              gt(availabilityHolds.expiresAt, new Date(now)),
            ),
          ),
        );

      const firmOverlaps = overlapping.filter((r) => r.tier === 'firm');
      const tentativeOverlaps = overlapping.filter((r) => r.tier === 'tentative');

      let preempted: readonly AvailabilityHold[] = [];
      if (hold.tier === 'firm') {
        // firm не лезет на firm; пересекающиеся tentative вытесняем.
        if (firmOverlaps.length > 0) {
          return err<InsertResult, AppError>(conflictError('Эти даты уже заняты'));
        }
        if (tentativeOverlaps.length > 0) {
          await tx.delete(availabilityHolds).where(
            inArray(
              availabilityHolds.id,
              tentativeOverlaps.map((r) => r.id),
            ),
          );
          preempted = tentativeOverlaps.map(toDomain);
        }
      } else {
        // tentative не лезет ни на что активное.
        if (overlapping.length > 0) {
          return err<InsertResult, AppError>(conflictError('Эти даты уже заняты'));
        }
      }

      await tx.insert(availabilityHolds).values(insertValues(hold));
      return ok<InsertResult, AppError>({ hold, preempted });
    }),

  promote: async (orgId, id) => {
    await db
      .update(availabilityHolds)
      .set({ tier: 'firm', expiresAt: null })
      .where(and(eq(availabilityHolds.orgId, orgId), eq(availabilityHolds.id, id)));
  },

  releaseExpired: async (now) => {
    const expired = await db
      .select()
      .from(availabilityHolds)
      .where(and(eq(availabilityHolds.tier, 'tentative'), lte(availabilityHolds.expiresAt, new Date(now))));
    if (expired.length > 0) {
      await db.delete(availabilityHolds).where(
        inArray(
          availabilityHolds.id,
          expired.map((r) => r.id),
        ),
      );
    }
    return expired.map(toDomain);
  },

  listForRange: async (orgId, from, to) => {
    const rows = await db
      .select()
      .from(availabilityHolds)
      .where(
        and(
          eq(availabilityHolds.orgId, orgId),
          lt(availabilityHolds.fromDate, to),
          gt(availabilityHolds.toDate, from),
        ),
      );
    return rows.map(toDomain);
  },

  getById: async (orgId, id) => {
    const rows = await db
      .select()
      .from(availabilityHolds)
      .where(and(eq(availabilityHolds.orgId, orgId), eq(availabilityHolds.id, id)));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },

  remove: async (orgId, id) => {
    await db.delete(availabilityHolds).where(and(eq(availabilityHolds.orgId, orgId), eq(availabilityHolds.id, id)));
  },
});
