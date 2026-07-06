import { err, ok, type Result } from 'neverthrow';
import type { ReservationView } from '@pms/shared';
import { type AppError, notFoundError } from '../../../shared/errors';
import { toReservationView } from '../domain/view';
import type { AvailabilityPort } from '../ports/availability';
import type { ReservationRepo } from '../ports/reservation-repo';

export type CancelReservationDeps = {
  readonly reservations: ReservationRepo;
  readonly availability: AvailabilityPort;
};

/** Отменить бронь: освобождаем hold (даты снова свободны) и помечаем cancelled. Идемпотентно. */
export const cancelReservation =
  (deps: CancelReservationDeps) =>
  async (orgId: string, id: string): Promise<Result<ReservationView, AppError>> => {
    const reservation = await deps.reservations.getById(orgId, id);
    if (!reservation) {
      return err(notFoundError('Бронь не найдена'));
    }
    if (reservation.status === 'cancelled') {
      return ok(toReservationView(reservation));
    }
    if (reservation.holdId) {
      await deps.availability.release(orgId, reservation.holdId);
    }
    const cancelled = { ...reservation, status: 'cancelled' as const, holdId: null };
    await deps.reservations.save(cancelled);
    return ok(toReservationView(cancelled));
  };

export const listPropertyReservations =
  (deps: Pick<CancelReservationDeps, 'reservations'>) =>
  async (orgId: string, propertyId: string): Promise<ReservationView[]> => {
    const list = await deps.reservations.listByProperty(orgId, propertyId);
    return list.map(toReservationView);
  };
