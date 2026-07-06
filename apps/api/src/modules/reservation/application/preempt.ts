import type { ReservationRepo } from '../ports/reservation-repo';

/**
 * Пометить вытесненные брони: firm-захват выбил их tentative-холды. Трогаем только pending
 * (мягкие) — у них холд уже удалён в choke-point, переводим в 'preempted'.
 */
export const markPreempted = async (
  reservations: ReservationRepo,
  orgId: string,
  refIds: readonly string[],
): Promise<void> => {
  for (const refId of refIds) {
    const reservation = await reservations.getById(orgId, refId);
    if (reservation && reservation.status === 'pending') {
      await reservations.save({ ...reservation, status: 'preempted', holdId: null });
    }
  }
};
