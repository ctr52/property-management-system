import type { GuestPaymentInitiator, GuestReservationSource } from '../ports';

export type PayGuestDeps = {
  readonly reservations: GuestReservationSource;
  readonly payments: GuestPaymentInitiator;
  /** База для возврата браузера после оплаты (→ обратно на гостевую страницу). */
  readonly publicBaseUrl: string;
};

/**
 * Гость инициирует оплату ноги по токену → redirectUrl на провайдера (эмулятор).
 * orgId/reservationId резолвятся из токена; после оплаты провайдер вернёт браузер на /guest/:token.
 */
export const payGuest =
  (deps: PayGuestDeps) =>
  async (token: string, legId: string): Promise<{ redirectUrl: string } | null> => {
    const reservation = await deps.reservations.byToken(token);
    if (!reservation) return null;
    const returnUrl = `${deps.publicBaseUrl}/guest/${token}`;
    return deps.payments.init(reservation.orgId, reservation.id, legId, returnUrl);
  };
