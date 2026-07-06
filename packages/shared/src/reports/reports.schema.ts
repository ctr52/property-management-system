import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

/** Период отчёта — ночи [from, to) (выезд исключительно), как и брони. */
export const ReportQuerySchema = z
  .object({ from: dateString, to: dateString })
  .refine((v) => v.from < v.to, { message: 'Конец периода должен быть позже начала' });
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

/** Строка отчёта по объекту: загрузка, выручка, средний чек за ночь (ADR). */
export const PropertyReportRowSchema = z.object({
  propertyId: z.string().uuid(),
  propertyName: z.string(),
  /** Забронированных ночей в периоде (firm/confirmed брони, пересечение с окном). */
  bookedNights: z.number().int().nonnegative(),
  /** Доступных ночей в периоде = число ночей периода. */
  availableNights: z.number().int().nonnegative(),
  /** Загрузка 0–100, округление до целого. */
  occupancyPct: z.number().int().min(0).max(100),
  /** Выручка в периоде, minor units (пропорция ночей-в-окне для частично попавших броней). */
  revenueMinor: z.number().int().nonnegative(),
  /** Средний доход за ночь (revenue / bookedNights), minor units; 0 при отсутствии ночей. */
  adrMinor: z.number().int().nonnegative(),
});
export type PropertyReportRow = z.infer<typeof PropertyReportRowSchema>;

export const ReportTotalsSchema = z.object({
  properties: z.number().int().nonnegative(),
  bookedNights: z.number().int().nonnegative(),
  availableNights: z.number().int().nonnegative(),
  occupancyPct: z.number().int().min(0).max(100),
  revenueMinor: z.number().int().nonnegative(),
  adrMinor: z.number().int().nonnegative(),
});
export type ReportTotals = z.infer<typeof ReportTotalsSchema>;

export const ReportSchema = z.object({
  from: dateString,
  to: dateString,
  currency: z.string(),
  rows: z.array(PropertyReportRowSchema),
  totals: ReportTotalsSchema,
});
export type Report = z.infer<typeof ReportSchema>;
