import type { ReservationSource, ReservationStatus } from '@pms/shared';

export type { ReservationSource, ReservationStatus };

/** Бронь любого источника. Владеет hold'ом доступности (holdId). */
export type Reservation = {
  readonly id: string;
  readonly orgId: string;
  readonly propertyId: string;
  readonly checkIn: string; // YYYY-MM-DD
  readonly checkOut: string; // YYYY-MM-DD исключительно
  readonly guestName: string;
  readonly guestContact: string | null;
  readonly source: ReservationSource;
  readonly externalId: string | null; // идемпотентность для каналов
  readonly status: ReservationStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly holdId: string | null;
  /** Неугадываемый токен гостевой страницы. */
  readonly guestToken: string;
  /** Код доступа (раскрывается гостю только когда бронь firm/confirmed). */
  readonly accessCode: string;
  readonly createdAt: string;
};
