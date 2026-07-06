import { describe, expect, it } from 'vitest';
import { overlaps, validateRange } from './interval';

describe('overlaps (полуоткрытые интервалы ночей)', () => {
  it('пересекающиеся → true', () => {
    expect(overlaps('2026-07-10', '2026-07-15', '2026-07-12', '2026-07-20')).toBe(true);
  });
  it('back-to-back (выезд = заезд) → false', () => {
    expect(overlaps('2026-07-10', '2026-07-13', '2026-07-13', '2026-07-16')).toBe(false);
  });
  it('полностью раздельные → false', () => {
    expect(overlaps('2026-07-10', '2026-07-13', '2026-07-20', '2026-07-22')).toBe(false);
  });
  it('вложенные → true', () => {
    expect(overlaps('2026-07-10', '2026-07-20', '2026-07-12', '2026-07-14')).toBe(true);
  });
  it('симметрично по аргументам', () => {
    expect(overlaps('2026-07-12', '2026-07-20', '2026-07-10', '2026-07-15')).toBe(true);
  });
});

describe('validateRange', () => {
  it('from < to → ok', () => {
    expect(validateRange('2026-07-10', '2026-07-11').isOk()).toBe(true);
  });
  it('from == to → err', () => {
    expect(validateRange('2026-07-10', '2026-07-10').isErr()).toBe(true);
  });
  it('from > to → err', () => {
    expect(validateRange('2026-07-11', '2026-07-10').isErr()).toBe(true);
  });
});
