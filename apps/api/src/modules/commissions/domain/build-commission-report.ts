import type {
  CommissionReport,
  CommissionReportRow,
  CommissionRule,
  ReservationSource,
} from '@pms/shared';
import { commissionFor } from './compute-commission';

/** Бронь для отчёта по комиссиям (передаются только подтверждённые). */
export type CommissionReservation = {
  readonly source: ReservationSource;
  readonly checkIn: string; // YYYY-MM-DD
  readonly amountMinor: number;
  readonly currency: string;
};

const ALL_SOURCES: readonly ReservationSource[] = ['direct', 'avito', 'cian'];

/**
 * Чистый отчёт по комиссиям за период: агрегат по каналу. Бронь относится к периоду по дате
 * ЗАЕЗДА (check-in ∈ [from, to)). Для каждой брони берём правило её канала и считаем комиссию.
 */
export const buildCommissionReport = (
  reservations: readonly CommissionReservation[],
  rules: ReadonlyMap<ReservationSource, CommissionRule>,
  from: string,
  to: string,
  currency = 'RUB',
): CommissionReport => {
  const acc = new Map<ReservationSource, { bookings: number; grossMinor: number; commissionMinor: number }>();

  for (const r of reservations) {
    if (r.checkIn < from || r.checkIn >= to) continue;
    const rule = rules.get(r.source) ?? null;
    const { commissionMinor } = commissionFor(r.amountMinor, rule);
    const a = acc.get(r.source) ?? { bookings: 0, grossMinor: 0, commissionMinor: 0 };
    a.bookings += 1;
    a.grossMinor += r.amountMinor;
    a.commissionMinor += commissionMinor;
    acc.set(r.source, a);
  }

  const rows: CommissionReportRow[] = ALL_SOURCES.filter((s) => acc.has(s)).map((source) => {
    const a = acc.get(source)!;
    const rule = rules.get(source) ?? null;
    return {
      source,
      bookings: a.bookings,
      grossMinor: a.grossMinor,
      commissionMinor: a.commissionMinor,
      netMinor: a.grossMinor - a.commissionMinor,
      percentBips: rule?.percentBips ?? null,
      fixedMinor: rule?.fixedMinor ?? null,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      bookings: t.bookings + r.bookings,
      grossMinor: t.grossMinor + r.grossMinor,
      commissionMinor: t.commissionMinor + r.commissionMinor,
      netMinor: t.netMinor + r.netMinor,
    }),
    { bookings: 0, grossMinor: 0, commissionMinor: 0, netMinor: 0 },
  );

  return { from, to, currency, rows, totals };
};
