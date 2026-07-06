import type { AvailabilityPort } from '../ports/availability';
import type { ReservationRepo } from '../ports/reservation-repo';

export type ConfirmReservationDeps = {
  readonly reservations: ReservationRepo;
  readonly availability: AvailabilityPort;
};

/**
 * Подтверждение брони по факту оплаты: pending → confirmed, tentative-холд → firm.
 * Вызывается из платёжного вебхука по reservationId. Идемпотентно: не-pending игнорируем
 * (сотруднические/уже-firm брони не трогаем).
 */
export const confirmReservation =
  (deps: ConfirmReservationDeps) =>
  async (orgId: string, reservationId: string): Promise<void> => {
    const reservation = await deps.reservations.getById(orgId, reservationId);
    if (!reservation || reservation.status !== 'pending' || !reservation.holdId) return;
    await deps.availability.promote(orgId, reservation.holdId);
    await deps.reservations.save({ ...reservation, status: 'confirmed' });
  };
