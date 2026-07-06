import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { reservations } from '../../../db/schema';
import type { Reservation, ReservationSource, ReservationStatus } from '../domain/types';
import type { ReservationRepo } from '../ports/reservation-repo';

type Row = typeof reservations.$inferSelect;

const toDomain = (row: Row): Reservation => ({
  id: row.id,
  orgId: row.orgId,
  propertyId: row.propertyId,
  checkIn: row.checkIn,
  checkOut: row.checkOut,
  guestName: row.guestName,
  guestContact: row.guestContact,
  source: row.source as ReservationSource,
  externalId: row.externalId,
  status: row.status as ReservationStatus,
  amountMinor: row.amountMinor,
  currency: row.currency,
  holdId: row.holdId,
  guestToken: row.guestToken,
  accessCode: row.accessCode,
  createdAt: row.createdAt.toISOString(),
});

const toValues = (r: Reservation) => ({
  id: r.id,
  orgId: r.orgId,
  propertyId: r.propertyId,
  checkIn: r.checkIn,
  checkOut: r.checkOut,
  guestName: r.guestName,
  guestContact: r.guestContact,
  source: r.source,
  externalId: r.externalId,
  status: r.status,
  amountMinor: r.amountMinor,
  currency: r.currency,
  holdId: r.holdId,
  guestToken: r.guestToken,
  accessCode: r.accessCode,
  createdAt: new Date(r.createdAt),
});

export const createDrizzleReservationRepo = (db: Db): ReservationRepo => ({
  save: async (reservation) => {
    const values = toValues(reservation);
    await db
      .insert(reservations)
      .values(values)
      .onConflictDoUpdate({
        target: reservations.id,
        set: { status: values.status, holdId: values.holdId },
      });
  },
  getById: async (orgId, id) => {
    const rows = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.orgId, orgId), eq(reservations.id, id)));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  getByExternalId: async (orgId, source, externalId) => {
    const rows = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.orgId, orgId),
          eq(reservations.source, source),
          eq(reservations.externalId, externalId),
        ),
      );
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  listByProperty: async (orgId, propertyId) => {
    const rows = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.orgId, orgId), eq(reservations.propertyId, propertyId)));
    return rows.map(toDomain);
  },
  getByGuestToken: async (token) => {
    const rows = await db.select().from(reservations).where(eq(reservations.guestToken, token));
    const row = rows[0];
    return row ? toDomain(row) : null;
  },
  listConfirmedForCleaning: async () => {
    const rows = await db.select().from(reservations).where(eq(reservations.status, 'confirmed'));
    return rows.map(toDomain);
  },
  listConfirmedByOrg: async (orgId) => {
    const rows = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.orgId, orgId), eq(reservations.status, 'confirmed')));
    return rows.map(toDomain);
  },
});
