import type { Reservation, ReservationSource } from '../domain/types';

export type ReservationRepo = {
  readonly save: (reservation: Reservation) => Promise<void>;
  readonly getById: (orgId: string, id: string) => Promise<Reservation | null>;
  /** Идемпотентность приёма брони с площадки (по источнику + внешнему id). */
  readonly getByExternalId: (
    orgId: string,
    source: ReservationSource,
    externalId: string,
  ) => Promise<Reservation | null>;
  readonly listByProperty: (orgId: string, propertyId: string) => Promise<Reservation[]>;
  /** Резолв брони по гостевому токену (публичный доступ, без orgId). */
  readonly getByGuestToken: (token: string) => Promise<Reservation | null>;
  /** Кросс-орг (системный reconcile уборок): все подтверждённые брони. */
  readonly listConfirmedForCleaning: () => Promise<Reservation[]>;
  /** Подтверждённые брони организации (для отчётов по загрузке/выручке). */
  readonly listConfirmedByOrg: (orgId: string) => Promise<Reservation[]>;
};
