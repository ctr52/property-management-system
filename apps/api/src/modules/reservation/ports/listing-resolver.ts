import type { ReservationSource } from '../domain/types';

/**
 * Резолв нашего объекта по id листинга на площадке (для входящих броней).
 * Реализуется в composition root поверх ListingLink — Reservations не знает про каналы.
 */
export type ListingResolver = {
  readonly propertyIdFor: (
    orgId: string,
    source: ReservationSource,
    externalListingId: string,
  ) => Promise<string | null>;
};
