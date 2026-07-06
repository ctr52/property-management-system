import type { ReportProperty, ReportReservation } from '../domain/build-report';

/**
 * Узкие порты-источники для отчётов — реализуются в composition root поверх существующих
 * репозиториев Property/Reservation. Модуль Reports не зависит от их внутренних типов/БД.
 */
export type ReportPropertySource = {
  readonly list: (orgId: string) => Promise<ReportProperty[]>;
};

export type ReportReservationSource = {
  /** Только подтверждённые (firm/confirmed) брони организации. */
  readonly listConfirmed: (orgId: string) => Promise<ReportReservation[]>;
};
