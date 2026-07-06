import { describe, expect, it } from 'vitest';
import type { PriceConditionValue, PriceOperator } from '@pms/shared';
import { quoteStay } from './engine';
import type { PriceAdjustment, PricePredicate, PriceRule } from './types';

const cond = (fact: string, op: PriceOperator, value: PriceConditionValue): PricePredicate => ({
  kind: 'cond',
  fact,
  op,
  value,
});

const rule = (match: PricePredicate, adjustment: PriceAdjustment, over: Partial<PriceRule> = {}): PriceRule => ({
  id: 'r',
  orgId: 'o1',
  propertyId: 'p1',
  label: 'r',
  priority: 0,
  enabled: true,
  match,
  adjustment,
  ...over,
});

const BASE = 1_000_000; // 10 000 ₽
const noOverride = () => null;
const TODAY = '2026-06-01';

describe('quoteStay (расчёт цены проживания)', () => {
  it('считает по ночам [checkIn, checkOut) — выезд исключительно', () => {
    // 2026-07-08 (Ср) → 2026-07-11: ночи 08, 09, 10 = 3 ночи
    const q = quoteStay(BASE, [], noOverride, '2026-07-08', '2026-07-11', TODAY);
    expect(q.nights).toBe(3);
    expect(q.perNight.map((n) => n.date)).toEqual(['2026-07-08', '2026-07-09', '2026-07-10']);
    expect(q.totalMinor).toBe(3 * BASE);
  });

  it('применяет правило выходного дня к попавшим ночам', () => {
    // 2026-07-10 (Пт) → 2026-07-13: ночи Пт(10), Сб(11), Вс(12); +20% на Сб/Вс
    const weekend = rule(cond('is_weekend', 'eq', true), { type: 'percent', value: 20 });
    const q = quoteStay(BASE, [weekend], noOverride, '2026-07-10', '2026-07-13', TODAY);
    expect(q.totalMinor).toBe(BASE + 1_200_000 + 1_200_000);
  });

  it('факт length_of_stay доступен — скидка за длительное проживание', () => {
    const longStay = rule(cond('length_of_stay', 'gte', 7), { type: 'percent', value: -10 });
    const short = quoteStay(BASE, [longStay], noOverride, '2026-07-01', '2026-07-04', TODAY); // 3 ночи
    expect(short.totalMinor).toBe(3 * BASE);
    const long = quoteStay(BASE, [longStay], noOverride, '2026-07-01', '2026-07-08', TODAY); // 7 ночей
    expect(long.totalMinor).toBe(7 * 900_000);
  });

  it('факт lead_time_days = дней от сегодня до заезда', () => {
    const earlyBird = rule(cond('lead_time_days', 'gte', 30), { type: 'percent', value: -15 });
    // от 2026-06-01 до 2026-07-08 = 37 дней ≥ 30 → скидка
    const q = quoteStay(BASE, [earlyBird], noOverride, '2026-07-08', '2026-07-09', TODAY);
    expect(q.totalMinor).toBe(850_000);
  });

  it('ручной override перебивает базу для конкретной ночи', () => {
    const overrideFor = (date: string) => (date === '2026-07-09' ? 500_000 : null);
    const q = quoteStay(BASE, [], overrideFor, '2026-07-08', '2026-07-11', TODAY);
    expect(q.totalMinor).toBe(BASE + 500_000 + BASE);
  });
});
