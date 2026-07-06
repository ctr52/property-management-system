import { describe, expect, it } from 'vitest';
import type { Property } from '@pms/shared';
import { buildCalendar, type CalendarHold } from './build-calendar';

// buildCalendar читает только id/title/currency/basePriceMinor — минимальный каст для теста.
const prop = { id: 'p1', title: 'Студия', currency: 'RUB', basePriceMinor: 350_000 } as unknown as Property;

// Тривиальный резолвер цены: возвращает базу (логика цены проверяется в engine.test).
const flatPrice = (_propertyId: string, baseMinor: number) => baseMinor;

describe('buildCalendar (read-model)', () => {
  it('один день, без holds → одна open-ячейка', () => {
    const r = buildCalendar([prop], [], '2026-07-10', '2026-07-10', flatPrice);
    expect(r.isOk()).toBe(true);
    r.map((v) => {
      expect(v.dates).toEqual(['2026-07-10']);
      expect(v.rows[0]?.cells[0]?.state).toBe('open');
    });
  });

  it('hold помечает booked только ночи [from,to); ночь выезда свободна', () => {
    const holds: CalendarHold[] = [
      { id: 'h1', propertyId: 'p1', from: '2026-07-11', to: '2026-07-13', kind: 'reservation', tier: 'firm', label: 'Иван' },
    ];
    const r = buildCalendar([prop], holds, '2026-07-10', '2026-07-13', flatPrice);
    expect(r.isOk()).toBe(true);
    r.map((v) => {
      expect(v.rows[0]?.cells.map((c) => c.state)).toEqual(['open', 'booked', 'booked', 'open']);
    });
  });

  it('tentative-бронь → состояние pending', () => {
    const holds: CalendarHold[] = [
      { id: 't1', propertyId: 'p1', from: '2026-07-11', to: '2026-07-12', kind: 'reservation', tier: 'tentative', label: 'Пётр' },
    ];
    const r = buildCalendar([prop], holds, '2026-07-10', '2026-07-12', flatPrice);
    expect(r.isOk()).toBe(true);
    r.map((v) => {
      expect(v.rows[0]?.cells.map((c) => c.state)).toEqual(['open', 'pending', 'open']);
    });
  });

  it('block и cleaning маппятся в свои состояния', () => {
    const holds: CalendarHold[] = [
      { id: 'b1', propertyId: 'p1', from: '2026-07-10', to: '2026-07-11', kind: 'block', tier: 'firm', label: null },
      { id: 'c1', propertyId: 'p1', from: '2026-07-11', to: '2026-07-12', kind: 'cleaning', tier: 'firm', label: null },
    ];
    const r = buildCalendar([prop], holds, '2026-07-10', '2026-07-12', flatPrice);
    expect(r.isOk()).toBe(true);
    r.map((v) => {
      expect(v.rows[0]?.cells.map((c) => c.state)).toEqual(['blocked', 'cleaning', 'open']);
    });
  });

  it('диапазон больше лимита → err', () => {
    expect(buildCalendar([prop], [], '2026-01-01', '2026-12-31', flatPrice).isErr()).toBe(true);
  });

  it('to раньше from → err', () => {
    expect(buildCalendar([prop], [], '2026-07-10', '2026-07-09', flatPrice).isErr()).toBe(true);
  });
});
