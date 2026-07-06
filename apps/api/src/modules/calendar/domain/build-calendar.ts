import { err, ok, type Result } from 'neverthrow';
import type { CalendarCellState, CalendarView, HoldKind, HoldTier, Property } from '@pms/shared';
import { type AppError, validationError } from '../../../shared/errors';

const DAY_MS = 86_400_000;
const MAX_DAYS = 62;

const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Занятость для read-model: минимум, что нужно ячейке (без зависимости от модуля Availability). */
export type CalendarHold = {
  readonly propertyId: string;
  readonly from: string;
  readonly to: string;
  readonly kind: HoldKind;
  readonly tier: HoldTier;
  readonly id: string;
  /** Подпись (имя гостя / причина блокировки); null → подставим по виду. */
  readonly label: string | null;
};

const defaultLabel: Record<HoldKind, string> = {
  reservation: 'Бронь',
  block: 'Блокировка',
  cleaning: 'Уборка',
};

const nextIso = (iso: string): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

const stateForKind: Record<HoldKind, CalendarCellState> = {
  reservation: 'booked',
  block: 'blocked',
  cleaning: 'cleaning',
};

/** Мягкая бронь (tentative) показывается отдельным состоянием — «придержано». */
const cellState = (hold: CalendarHold): CalendarCellState =>
  hold.kind === 'reservation' && hold.tier === 'tentative' ? 'pending' : stateForKind[hold.kind];

/**
 * Чистая проекция: объекты + holds + диапазон → сетка календаря.
 * Ячейка занята, если её дату накрывает hold [from, to) (дата ∈ ночам интервала).
 * Инвариант не-пересечения гарантирует ≤1 активный hold на дату.
 */
/** Цена за ночь для ячейки. Чистая инъекция — calendar не знает про движок прайсинга. */
export type NightlyPrice = (propertyId: string, baseMinor: number, date: string) => number;

export const buildCalendar = (
  properties: readonly Property[],
  holds: readonly CalendarHold[],
  from: string,
  to: string,
  priceFor: NightlyPrice,
): Result<CalendarView, AppError> => {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return err(validationError('Некорректная дата'));
  }
  if (end < start) {
    return err(validationError('Дата «to» раньше «from»'));
  }
  if ((end - start) / DAY_MS + 1 > MAX_DAYS) {
    return err(validationError(`Диапазон больше ${MAX_DAYS} дней`));
  }

  const dates: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    dates.push(toIso(t));
  }

  const rows = properties.map((property) => {
    const propertyHolds = holds.filter((h) => h.propertyId === property.id);
    return {
      propertyId: property.id,
      title: property.title,
      currency: property.currency,
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      cells: dates.map((date) => {
        const hold = propertyHolds.find((h) => h.from <= date && date < h.to);
        return {
          date,
          priceMinor: priceFor(property.id, property.basePriceMinor, date),
          state: hold ? cellState(hold) : ('open' as const),
          holdId: hold ? hold.id : null,
          label: hold ? hold.label ?? defaultLabel[hold.kind] : null,
          isStart: hold ? hold.from === date : false,
          isEnd: hold ? nextIso(date) === hold.to : false,
        };
      }),
    };
  });

  return ok({ from, to, dates, rows });
};
