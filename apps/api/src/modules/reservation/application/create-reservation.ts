import { err, ok, type Result } from 'neverthrow';
import type { CreateReservationInput, ReservationView } from '@pms/shared';
import type { AppError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import type { Reservation } from '../domain/types';
import { toReservationView } from '../domain/view';
import type { AvailabilityPort } from '../ports/availability';
import type { ReservationRepo } from '../ports/reservation-repo';
import { markPreempted } from './preempt';

export type CreateReservationDeps = {
  readonly reservations: ReservationRepo;
  readonly availability: AvailabilityPort;
  readonly idGen: IdGen;
  readonly clock: Clock;
  /** Токен гостевой страницы (неугадываемый) и код доступа. */
  readonly genToken: () => string;
  readonly genCode: () => string;
};

/**
 * Создать бронь через платформу. Сотрудник доверенный → захват сразу firm (confirmed).
 * Атомарный hold: заняты firm-датами → conflict; пересекающиеся tentative — вытесняются.
 */
export const createReservation =
  (deps: CreateReservationDeps) =>
  async (orgId: string, input: CreateReservationInput): Promise<Result<ReservationView, AppError>> => {
    const id = deps.idGen();

    const held = await deps.availability.hold({
      orgId,
      propertyId: input.propertyId,
      from: input.checkIn,
      to: input.checkOut,
      refId: id,
      note: input.guestName,
      tier: 'firm',
      expiresAt: null,
    });
    if (held.isErr()) {
      return err(held.error); // conflict (даты заняты firm) или объект не найден
    }
    await markPreempted(deps.reservations, orgId, held.value.preemptedRefIds);

    const reservation: Reservation = {
      id,
      orgId,
      propertyId: input.propertyId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestName: input.guestName,
      guestContact: input.guestContact ?? null,
      source: 'direct',
      externalId: null,
      status: 'confirmed',
      amountMinor: input.amountMinor,
      currency: input.currency,
      holdId: held.value.id,
      guestToken: deps.genToken(),
      accessCode: deps.genCode(),
      createdAt: deps.clock.now().toISOString(),
    };
    await deps.reservations.save(reservation);
    return ok(toReservationView(reservation));
  };
