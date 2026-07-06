import { ok, type Result } from 'neverthrow';
import type { CommissionReport, CommissionReportQuery, CommissionRule, ReservationSource } from '@pms/shared';
import type { AppError } from '../../../shared/errors';
import { buildCommissionReport } from '../domain/build-commission-report';
import type { CommissionReservationSource, CommissionRuleRepo } from '../ports/repos';

export type GetCommissionReportDeps = {
  readonly rules: CommissionRuleRepo;
  readonly reservations: CommissionReservationSource;
};

/** Отчёт по комиссиям за период: тянет правила + брони и считает чистым `buildCommissionReport`. */
export const getCommissionReport =
  (deps: GetCommissionReportDeps) =>
  async (orgId: string, query: CommissionReportQuery): Promise<Result<CommissionReport, AppError>> => {
    const [ruleList, reservations] = await Promise.all([
      deps.rules.listByOrg(orgId),
      deps.reservations.listConfirmed(orgId),
    ]);
    const ruleMap = new Map<ReservationSource, CommissionRule>(ruleList.map((r) => [r.source, r]));
    const currency = reservations[0]?.currency ?? 'RUB';
    return ok(buildCommissionReport(reservations, ruleMap, query.from, query.to, currency));
  };
