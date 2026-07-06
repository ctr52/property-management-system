import { describe, expect, it } from 'vitest';
import type { PriceConditionValue, PriceOperator } from '@pms/shared';
import { computeNightlyPrice } from './engine';
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
const pct = (value: number): PriceAdjustment => ({ type: 'percent', value });

describe('computeNightlyPrice (generic-DSL движок)', () => {
  it('без правил → база', () => {
    expect(computeNightlyPrice(BASE, [], null, { date: '2026-07-08' })).toBe(BASE);
  });

  it('условие is_weekend=true срабатывает в Сб/Вс', () => {
    const r = rule(cond('is_weekend', 'eq', true), pct(20));
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-11' })).toBe(1_200_000); // Сб
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08' })).toBe(BASE); // Ср
  });

  it('сезон через all: [date>=from, date<to]', () => {
    const seasonal: PricePredicate = {
      kind: 'all',
      nodes: [cond('date', 'gte', '2026-07-01'), cond('date', 'lt', '2026-08-01')],
    };
    const r = rule(seasonal, pct(20));
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-15' })).toBe(1_200_000);
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-08-01' })).toBe(BASE); // граница исключительна
  });

  it('day_of_week через in [5,6]', () => {
    const r = rule(cond('dow', 'in', [5, 6]), pct(10));
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-11' })).toBe(1_100_000); // Сб=6
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08' })).toBe(BASE); // Ср=3
  });

  it('length_of_stay через between [7,365] (LOS-скидка)', () => {
    const r = rule(cond('length_of_stay', 'between', [7, 365]), pct(-10));
    // per-date контекст: факт отсутствует → правило не влияет (важно для календаря)
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08' })).toBe(BASE);
    // котировка брони на 10 ночей → -10%
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08', lengthOfStay: 10 })).toBe(900_000);
    // короткая бронь → без скидки
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08', lengthOfStay: 3 })).toBe(BASE);
  });

  it('last-minute: lead_time_days <= 3', () => {
    const r = rule(cond('lead_time_days', 'lte', 3), pct(-15));
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08', leadTimeDays: 2 })).toBe(850_000);
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08', leadTimeDays: 30 })).toBe(BASE);
  });

  it('правила стакаются по возрастанию priority', () => {
    const seasonal = rule(
      { kind: 'all', nodes: [cond('date', 'gte', '2026-07-01'), cond('date', 'lt', '2026-08-01')] },
      pct(10),
      { priority: 1 },
    );
    const weekend = rule(cond('is_weekend', 'eq', true), pct(10), { priority: 2 });
    expect(computeNightlyPrice(BASE, [weekend, seasonal], null, { date: '2026-07-11' })).toBe(1_210_000); // 1.1*1.1
  });

  it('not инвертирует (будни = не выходные)', () => {
    const r = rule({ kind: 'not', node: cond('is_weekend', 'eq', true) }, pct(-5));
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-08' })).toBe(950_000); // Ср
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-11' })).toBe(BASE); // Сб
  });

  it('disabled правило игнорируется', () => {
    const r = rule(cond('is_weekend', 'eq', true), pct(50), { enabled: false });
    expect(computeNightlyPrice(BASE, [r], null, { date: '2026-07-11' })).toBe(BASE);
  });

  it('override перебивает базу и «наши» правила', () => {
    const r = rule(cond('is_weekend', 'eq', true), pct(50));
    expect(computeNightlyPrice(BASE, [r], 777_000, { date: '2026-07-11' })).toBe(777_000);
  });

  it('канальное правило (predicate ссылается на platform) — только при ctx.platform и поверх override', () => {
    const markup = rule(cond('platform', 'eq', 'avito'), pct(15));
    expect(computeNightlyPrice(BASE, [markup], null, { date: '2026-07-08' })).toBe(BASE); // наша цена
    expect(computeNightlyPrice(BASE, [markup], null, { date: '2026-07-08', platform: 'avito' })).toBe(1_150_000);
    expect(computeNightlyPrice(BASE, [markup], null, { date: '2026-07-08', platform: 'cian' })).toBe(BASE);
    expect(computeNightlyPrice(BASE, [markup], 500_000, { date: '2026-07-08', platform: 'avito' })).toBe(575_000);
  });

  it('absolute устанавливает цену; результат не ниже 0', () => {
    const abs = rule(cond('is_weekend', 'eq', true), { type: 'absolute', amountMinor: 2_000_000 });
    expect(computeNightlyPrice(BASE, [abs], null, { date: '2026-07-11' })).toBe(2_000_000);
    const neg = rule(cond('is_weekend', 'eq', true), { type: 'delta', amountMinor: -5_000_000 });
    expect(computeNightlyPrice(BASE, [neg], null, { date: '2026-07-11' })).toBe(0);
  });
});
