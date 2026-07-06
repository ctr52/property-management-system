import { ok, type Result } from 'neverthrow';
import type { Report, ReportQuery } from '@pms/shared';
import type { AppError } from '../../../shared/errors';
import { buildReport } from '../domain/build-report';
import type { ReportPropertySource, ReportReservationSource } from '../ports/sources';

export type GetReportDeps = {
  readonly properties: ReportPropertySource;
  readonly reservations: ReportReservationSource;
};

/** Отчёт по загрузке/выручке за период: тянет источники и считает чистым `buildReport`. */
export const getReport =
  (deps: GetReportDeps) =>
  async (orgId: string, query: ReportQuery): Promise<Result<Report, AppError>> => {
    const [properties, reservations] = await Promise.all([
      deps.properties.list(orgId),
      deps.reservations.listConfirmed(orgId),
    ]);
    return ok(buildReport(properties, reservations, query.from, query.to));
  };
