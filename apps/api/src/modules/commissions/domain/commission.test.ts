import { describe, expect, it } from 'vitest';
import type { CommissionRule, ReservationSource } from '@pms/shared';
import { commissionFor } from './compute-commission';
import { buildCommissionReport, type CommissionReservation } from './build-commission-report';

const rule = (source: ReservationSource, percentBips: number, fixedMinor = 0): CommissionRule => ({
  source,
  percentBips,
  fixedMinor,
});

describe('commissionFor', () => {
  it('процент в bips + фикс', () => {
    // 15% от 1 000 000 = 150 000, + 5 000 фикс
    expect(commissionFor(1_000_000, rule('avito', 1500, 5_000))).toEqual({
      commissionMinor: 155_000,
      netMinor: 845_000,
    });
  });

  it('без правила → комиссия 0', () => {
    expect(commissionFor(1_000_000, null)).toEqual({ commissionMinor: 0, netMinor: 1_000_000 });
  });

  it('комиссия не превышает сумму брони', () => {
    expect(commissionFor(100_000, rule('avito', 100_000, 50_000))).toEqual({
      commissionMinor: 100_000,
      netMinor: 0,
    });
  });
});

describe('buildCommissionReport', () => {
  const rules = new Map<ReservationSource, CommissionRule>([
    ['avito', rule('avito', 1500)], // 15%
    ['cian', rule('cian', 1000)], // 10%
    // direct — правила нет → комиссия 0
  ]);

  const res = (source: ReservationSource, checkIn: string, amountMinor: number): CommissionReservation => ({
    source,
    checkIn,
    amountMinor,
    currency: 'RUB',
  });

  it('агрегирует по каналу, относит бронь по дате заезда', () => {
    const reservations = [
      res('avito', '2026-07-05', 1_000_000), // в окне → 150 000
      res('avito', '2026-07-20', 2_000_000), // в окне → 300 000
      res('cian', '2026-07-10', 1_000_000), // в окне → 100 000
      res('direct', '2026-07-10', 500_000), // в окне → комиссия 0
      res('avito', '2026-08-02', 9_000_000), // ВНЕ окна (заезд в августе)
    ];
    const report = buildCommissionReport(reservations, rules, '2026-07-01', '2026-08-01');

    const avito = report.rows.find((r) => r.source === 'avito');
    expect(avito).toMatchObject({ bookings: 2, grossMinor: 3_000_000, commissionMinor: 450_000, netMinor: 2_550_000 });

    const direct = report.rows.find((r) => r.source === 'direct');
    expect(direct).toMatchObject({ bookings: 1, commissionMinor: 0, percentBips: null });

    expect(report.totals).toEqual({
      bookings: 4,
      grossMinor: 3_000_000 + 1_000_000 + 500_000, // avito 3M + cian 1M + direct 0.5M = 4.5M
      commissionMinor: 450_000 + 100_000, // direct = 0
      netMinor: 4_500_000 - 550_000, // 3.95M
    });
  });

  it('каналы без броней в отчёт не попадают', () => {
    const report = buildCommissionReport([res('avito', '2026-07-05', 1_000_000)], rules, '2026-07-01', '2026-08-01');
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.source).toBe('avito');
  });
});
