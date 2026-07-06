import { ok, type Result } from 'neverthrow';
import type { AppError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import type { Reservation, ReservationSource } from '../domain/types';
import type { AvailabilityPort } from '../ports/availability';
import type { ListingResolver } from '../ports/listing-resolver';
import type { ReservationRepo } from '../ports/reservation-repo';
import { markPreempted } from './preempt';

/** Статус брони на площадке: new (заявка) | confirmed (подтверждена/оплачена) | cancelled. */
export type ExternalBookingStatus = 'new' | 'confirmed' | 'cancelled';

export type IngestReservationInput = {
  readonly source: ReservationSource;
  readonly externalId: string;
  readonly externalListingId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly guestName: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: ExternalBookingStatus;
};

export type IngestReservationDeps = {
  readonly reservations: ReservationRepo;
  readonly availability: AvailabilityPort;
  readonly listings: ListingResolver;
  readonly idGen: IdGen;
  readonly clock: Clock;
  /** TTL мягкого холда для заявок ('new') с площадки. */
  readonly tentativeTtlMs: number;
  readonly genToken: () => string;
  readonly genCode: () => string;
};

/**
 * Приём брони с площадки (идемпотентно по source+externalId).
 *  - cancelled → отменяем существующую бронь (release холда);
 *  - confirmed → firm-холд (вытесняет наши tentative); занято firm → 'conflict';
 *  - new       → tentative-холд с TTL → 'pending'; занято → 'conflict'.
 * Всегда возвращаем ok — это приём события, а не запрос пользователя.
 */
export const ingestReservation =
  (deps: IngestReservationDeps) =>
  async (orgId: string, input: IngestReservationInput): Promise<Result<void, AppError>> => {
    const existing = await deps.reservations.getByExternalId(orgId, input.source, input.externalId);

    if (input.status === 'cancelled') {
      if (existing && existing.status !== 'cancelled') {
        if (existing.holdId) await deps.availability.release(orgId, existing.holdId);
        await deps.reservations.save({ ...existing, status: 'cancelled', holdId: null });
      }
      return ok(undefined);
    }

    if (existing) return ok(undefined); // уже принято (idempotent)

    const propertyId = await deps.listings.propertyIdFor(orgId, input.source, input.externalListingId);
    if (!propertyId) return ok(undefined); // неизвестный листинг — мягко игнорируем

    const id = deps.idGen();
    const now = deps.clock.now();
    const firm = input.status === 'confirmed';
    const held = await deps.availability.hold({
      orgId,
      propertyId,
      from: input.checkIn,
      to: input.checkOut,
      refId: id,
      note: input.guestName,
      tier: firm ? 'firm' : 'tentative',
      expiresAt: firm ? null : new Date(now.getTime() + deps.tentativeTtlMs).toISOString(),
    });

    if (held.isOk()) {
      await markPreempted(deps.reservations, orgId, held.value.preemptedRefIds);
    }

    const reservation: Reservation = {
      id,
      orgId,
      propertyId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestName: input.guestName,
      guestContact: null,
      source: input.source,
      externalId: input.externalId,
      status: held.isErr() ? 'conflict' : firm ? 'confirmed' : 'pending',
      amountMinor: input.amountMinor,
      currency: input.currency,
      holdId: held.isOk() ? held.value.id : null,
      guestToken: deps.genToken(),
      accessCode: deps.genCode(),
      createdAt: now.toISOString(),
    };
    await deps.reservations.save(reservation);
    return ok(undefined);
  };
