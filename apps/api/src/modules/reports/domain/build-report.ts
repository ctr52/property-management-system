import type { PropertyReportRow, Report, ReportTotals } from '@pms/shared';

/** Объект для отчёта (минимум полей). */
export type ReportProperty = {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
};

/** Бронь для отчёта (только подтверждённые передаются на вход). */
export type ReportReservation = {
  readonly propertyId: string;
  readonly checkIn: string; // YYYY-MM-DD
  readonly checkOut: string; // YYYY-MM-DD исключительно
  readonly amountMinor: number;
};

const DAY_MS = 86_400_000;
const nightsBetween = (from: string, to: string): number =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS));

const maxIso = (a: string, b: string): string => (a > b ? a : b);
const minIso = (a: string, b: string): string => (a < b ? a : b);

const pct = (booked: number, available: number): number =>
  available <= 0 ? 0 : Math.min(100, Math.round((booked / available) * 100));

const adr = (revenueMinor: number, bookedNights: number): number =>
  bookedNights <= 0 ? 0 : Math.round(revenueMinor / bookedNights);

/**
 * Чистый отчёт за период [from, to): по каждому объекту — загрузка (occupancy),
 * выручка и средний доход за ночь (ADR), плюс агрегаты. Брони, частично попадающие в окно,
 * учитываются пропорционально числу ночей внутри окна (и по ночам, и по выручке).
 */
export const buildReport = (
  properties: readonly ReportProperty[],
  reservations: readonly ReportReservation[],
  from: string,
  to: string,
): Report => {
  const windowNights = nightsBetween(from, to);
  const byProperty = new Map<string, { bookedNights: number; revenueMinor: number }>();

  for (const r of reservations) {
    const overlapFrom = maxIso(r.checkIn, from);
    const overlapTo = minIso(r.checkOut, to);
    const overlap = nightsBetween(overlapFrom, overlapTo);
    if (overlap <= 0) continue;
    const total = nightsBetween(r.checkIn, r.checkOut);
    const revenue = total <= 0 ? 0 : Math.round((r.amountMinor * overlap) / total);
    const acc = byProperty.get(r.propertyId) ?? { bookedNights: 0, revenueMinor: 0 };
    acc.bookedNights += overlap;
    acc.revenueMinor += revenue;
    byProperty.set(r.propertyId, acc);
  }

  const rows: PropertyReportRow[] = properties.map((p) => {
    const acc = byProperty.get(p.id) ?? { bookedNights: 0, revenueMinor: 0 };
    return {
      propertyId: p.id,
      propertyName: p.name,
      bookedNights: acc.bookedNights,
      availableNights: windowNights,
      occupancyPct: pct(acc.bookedNights, windowNights),
      revenueMinor: acc.revenueMinor,
      adrMinor: adr(acc.revenueMinor, acc.bookedNights),
    };
  });

  const sumBooked = rows.reduce((s, r) => s + r.bookedNights, 0);
  const sumAvailable = rows.reduce((s, r) => s + r.availableNights, 0);
  const sumRevenue = rows.reduce((s, r) => s + r.revenueMinor, 0);
  const totals: ReportTotals = {
    properties: properties.length,
    bookedNights: sumBooked,
    availableNights: sumAvailable,
    occupancyPct: pct(sumBooked, sumAvailable),
    revenueMinor: sumRevenue,
    adrMinor: adr(sumRevenue, sumBooked),
  };

  return { from, to, currency: properties[0]?.currency ?? 'RUB', rows, totals };
};
