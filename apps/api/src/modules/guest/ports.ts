/**
 * Узкие порты гостевого портала — реализуются в composition root поверх reservation/property/
 * payment модулей. Guest не зависит от их доменов напрямую (low coupling).
 */
export type GuestReservation = {
  readonly orgId: string;
  readonly id: string;
  readonly propertyId: string;
  readonly guestName: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly status: string;
  readonly accessCode: string;
};

export type GuestPropertyInfo = {
  readonly title: string;
  readonly address: string;
  readonly checkInTime: string;
  readonly checkOutTime: string;
};

export type GuestPaymentLeg = {
  readonly legId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly provider: string;
};

export type GuestReservationSource = {
  readonly byToken: (token: string) => Promise<GuestReservation | null>;
};
export type GuestPropertySource = {
  readonly get: (orgId: string, propertyId: string) => Promise<GuestPropertyInfo | null>;
};
export type GuestPaymentSource = {
  readonly payableLeg: (orgId: string, reservationId: string) => Promise<GuestPaymentLeg | null>;
};
export type GuestPaymentInitiator = {
  readonly init: (
    orgId: string,
    reservationId: string,
    legId: string,
    returnUrl: string,
  ) => Promise<{ redirectUrl: string } | null>;
};
