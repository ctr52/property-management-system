import type { CommissionRule } from '@pms/shared';
import type { CommissionReservation } from '../domain/build-commission-report';

export type CommissionRuleRepo = {
  readonly listByOrg: (orgId: string) => Promise<CommissionRule[]>;
  /** Upsert по (orgId, source). */
  readonly set: (orgId: string, rule: CommissionRule) => Promise<void>;
};

/**
 * Узкий источник броней для отчёта по комиссиям — реализуется в composition root поверх
 * Reservation. Модуль Commissions не зависит от внутренних типов Reservations.
 */
export type CommissionReservationSource = {
  readonly listConfirmed: (orgId: string) => Promise<CommissionReservation[]>;
};
