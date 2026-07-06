import type { Result } from 'neverthrow';
import type { CalendarView } from '@pms/shared';
import type { AppError } from '../../../shared/errors';
import { buildCalendar, type CalendarHold } from '../domain/build-calendar';
import type { CalendarPropertyRepo } from '../ports/property-repo';
import type { CalendarPriceSource } from '../ports/price-source';

/** Узкий порт чтения занятости для календаря (реализуется модулем Availability). */
export type CalendarHoldSource = {
  readonly listForRange: (orgId: string, from: string, to: string) => Promise<CalendarHold[]>;
};

export type GetCalendarDeps = {
  readonly properties: CalendarPropertyRepo;
  readonly holds: CalendarHoldSource;
  readonly prices: CalendarPriceSource;
};

/** Use-case: собрать календарь (объекты + занятость + цена за ночь) за диапазон дат. */
export const getCalendar =
  (deps: GetCalendarDeps) =>
  async (orgId: string, from: string, to: string): Promise<Result<CalendarView, AppError>> => {
    const [properties, holds, priceFor] = await Promise.all([
      deps.properties.list(orgId),
      deps.holds.listForRange(orgId, from, to),
      deps.prices.resolverForRange(orgId, from, to),
    ]);
    return buildCalendar(properties, holds, from, to, priceFor);
  };
