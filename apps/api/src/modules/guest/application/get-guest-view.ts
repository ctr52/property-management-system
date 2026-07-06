import type { GuestView, ReservationStatus } from '@pms/shared';
import type { GuestPaymentSource, GuestPropertySource, GuestReservationSource } from '../ports';

export type GetGuestViewDeps = {
  readonly reservations: GuestReservationSource;
  readonly properties: GuestPropertySource;
  readonly payments: GuestPaymentSource;
};

/**
 * Гостевая страница по токену. Код доступа раскрываем только для подтверждённой (firm) брони —
 * мягкий захват (pending) кода не выдаёт. Кнопка оплаты — если есть неоплаченная provider-нога.
 */
export const getGuestView =
  (deps: GetGuestViewDeps) =>
  async (token: string): Promise<GuestView | null> => {
    const reservation = await deps.reservations.byToken(token);
    if (!reservation) return null;

    const property = await deps.properties.get(reservation.orgId, reservation.propertyId);
    if (!property) return null;

    const payable = await deps.payments.payableLeg(reservation.orgId, reservation.id);

    return {
      guestName: reservation.guestName,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      status: reservation.status as ReservationStatus,
      property,
      accessCode: reservation.status === 'confirmed' ? reservation.accessCode : null,
      payable: payable
        ? {
            legId: payable.legId,
            amountMinor: payable.amountMinor,
            currency: payable.currency,
            provider: payable.provider,
          }
        : null,
    };
  };
