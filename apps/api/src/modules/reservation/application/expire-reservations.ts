import type { AvailabilityPort } from '../ports/availability';
import type { ReservationRepo } from '../ports/reservation-repo';

export type ExpireReservationsDeps = {
  readonly reservations: ReservationRepo;
  readonly availability: AvailabilityPort;
};

/**
 * Sweeper: снимает истёкшие tentative-холды и метит их брони 'expired'. Холды удаляются внутри
 * releaseExpired (там же эмитятся availability.changed); здесь — только статусы броней.
 */
export const expireReservations =
  (deps: ExpireReservationsDeps) =>
  async (): Promise<void> => {
    const expired = await deps.availability.releaseExpired();
    for (const { orgId, refId } of expired) {
      const reservation = await deps.reservations.getById(orgId, refId);
      if (reservation && reservation.status === 'pending') {
        await deps.reservations.save({ ...reservation, status: 'expired', holdId: null });
      }
    }
  };
