import { z } from 'zod';

// pending — мягкий захват (tentative): дата «придержана», но может истечь/быть вытесненной.
export const CalendarCellStateSchema = z.enum(['open', 'blocked', 'booked', 'cleaning', 'pending']);
export type CalendarCellState = z.infer<typeof CalendarCellStateSchema>;

export const CalendarCellSchema = z.object({
  date: z.string(), // YYYY-MM-DD — НОЧЬ, начинающаяся в эту дату
  priceMinor: z.number().int(),
  state: CalendarCellStateSchema,
  /** id занятости (hold), накрывающей ночь — для снятия блокировки кликом. */
  holdId: z.string().uuid().nullable(),
  /** Подпись занятости (имя гостя / причина блокировки) — для отображения на полосе. */
  label: z.string().nullable(),
  /** Эта ночь — день заезда (первая ночь брони). */
  isStart: z.boolean(),
  /** Эта ночь — последняя (выезд на следующее утро). */
  isEnd: z.boolean(),
});
export type CalendarCell = z.infer<typeof CalendarCellSchema>;

export const CalendarRowSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string(),
  currency: z.string(),
  /** Время заезда/выезда объекта — показываем в шапке строки. */
  checkInTime: z.string(),
  checkOutTime: z.string(),
  cells: z.array(CalendarCellSchema),
});
export type CalendarRow = z.infer<typeof CalendarRowSchema>;

export const CalendarViewSchema = z.object({
  from: z.string(),
  to: z.string(),
  dates: z.array(z.string()),
  rows: z.array(CalendarRowSchema),
});
export type CalendarView = z.infer<typeof CalendarViewSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

export const CalendarQuerySchema = z.object({
  from: dateString,
  to: dateString,
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
