import { describe, expect, it } from 'vitest';
import { buildReport, type ReportProperty, type ReportReservation } from './build-report';

const props: ReportProperty[] = [
  { id: 'p1', name: 'Студия', currency: 'RUB' },
  { id: 'p2', name: 'Двушка', currency: 'RUB' },
];

describe('buildReport (отчёт загрузки/выручки)', () => {
  it('пустой период → нули, но строки на каждый объект', () => {
    const report = buildReport(props, [], '2026-07-01', '2026-08-01');
    expect(report.rows).toHaveLength(2);
    expect(report.totals.bookedNights).toBe(0);
    expect(report.totals.occupancyPct).toBe(0);
    expect(report.totals.revenueMinor).toBe(0);
    expect(report.rows[0]?.availableNights).toBe(31);
  });

  it('бронь целиком в окне: ночи и выручка учитываются полностью', () => {
    // 2026-07-10 → 2026-07-14 = 4 ночи, 8000 ₽
    const res: ReportReservation[] = [
      { propertyId: 'p1', checkIn: '2026-07-10', checkOut: '2026-07-14', amountMinor: 800_000 },
    ];
    const report = buildReport(props, res, '2026-07-01', '2026-08-01'); // 31 ночь
    const p1 = report.rows.find((r) => r.propertyId === 'p1');
    expect(p1?.bookedNights).toBe(4);
    expect(p1?.revenueMinor).toBe(800_000);
    expect(p1?.occupancyPct).toBe(Math.round((4 / 31) * 100));
    expect(p1?.adrMinor).toBe(200_000);
  });

  it('бронь на стыке окна — учитывается пропорционально ночам внутри окна', () => {
    // 2026-06-29 → 2026-07-03: всего 4 ночи (29,30,01,02), в окне июля только 01,02 = 2 ночи
    const res: ReportReservation[] = [
      { propertyId: 'p1', checkIn: '2026-06-29', checkOut: '2026-07-03', amountMinor: 400_000 },
    ];
    const report = buildReport(props, res, '2026-07-01', '2026-08-01');
    const p1 = report.rows.find((r) => r.propertyId === 'p1');
    expect(p1?.bookedNights).toBe(2);
    expect(p1?.revenueMinor).toBe(200_000); // 400 000 * 2/4
  });

  it('агрегаты суммируют по всем объектам', () => {
    const res: ReportReservation[] = [
      { propertyId: 'p1', checkIn: '2026-07-01', checkOut: '2026-07-03', amountMinor: 200_000 },
      { propertyId: 'p2', checkIn: '2026-07-01', checkOut: '2026-07-06', amountMinor: 500_000 },
    ];
    const report = buildReport(props, res, '2026-07-01', '2026-08-01');
    expect(report.totals.bookedNights).toBe(7);
    expect(report.totals.revenueMinor).toBe(700_000);
    expect(report.totals.availableNights).toBe(62); // 2 объекта * 31
    expect(report.totals.adrMinor).toBe(100_000);
  });
});
