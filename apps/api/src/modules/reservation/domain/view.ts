import type { ReservationView } from '@pms/shared';
import type { Reservation } from './types';

/** Чистый маппинг брони в представление для клиента (без orgId/holdId/externalId). */
export const toReservationView = (r: Reservation): ReservationView => ({
  id: r.id,
  propertyId: r.propertyId,
  checkIn: r.checkIn,
  checkOut: r.checkOut,
  guestName: r.guestName,
  guestContact: r.guestContact,
  source: r.source,
  status: r.status,
  amountMinor: r.amountMinor,
  currency: r.currency,
  guestToken: r.guestToken,
});
