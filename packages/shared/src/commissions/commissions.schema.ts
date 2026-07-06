import { z } from 'zod';
import { ReservationSourceSchema } from '../reservation';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

/**
 * Комиссия площадки per-channel. Процент — в БАЗИСНЫХ ПУНКТАХ (bips, целое: 1% = 100 bips),
 * чтобы не тащить float в деньги (как и всё в проекте — minor units). Итог:
 * commission = round(amount * percentBips / 10000) + fixedMinor, в пределах [0, amount].
 */
export const CommissionRuleSchema = z.object({
  source: ReservationSourceSchema,
  percentBips: z.number().int().min(0).max(100_000), // до 1000%
  fixedMinor: z.number().int().nonnegative(),
});
export type CommissionRule = z.infer<typeof CommissionRuleSchema>;

/** Вход на установку правила (upsert по source). */
export const SetCommissionRuleInputSchema = CommissionRuleSchema;
export type SetCommissionRuleInput = z.infer<typeof SetCommissionRuleInputSchema>;

/** Строка отчёта по комиссиям — агрегат по каналу за период. */
export const CommissionReportRowSchema = z.object({
  source: ReservationSourceSchema,
  bookings: z.number().int().nonnegative(),
  /** Валовая выручка (сумма броней канала), minor units. */
  grossMinor: z.number().int().nonnegative(),
  /** Комиссия площадки, minor units. */
  commissionMinor: z.number().int().nonnegative(),
  /** Чистыми арендодателю = gross − commission, minor units. */
  netMinor: z.number().int().nonnegative(),
  /** Применённое правило (для прозрачности расчёта); null — правило не задано (комиссия 0). */
  percentBips: z.number().int().nonnegative().nullable(),
  fixedMinor: z.number().int().nonnegative().nullable(),
});
export type CommissionReportRow = z.infer<typeof CommissionReportRowSchema>;

export const CommissionReportTotalsSchema = z.object({
  bookings: z.number().int().nonnegative(),
  grossMinor: z.number().int().nonnegative(),
  commissionMinor: z.number().int().nonnegative(),
  netMinor: z.number().int().nonnegative(),
});
export type CommissionReportTotals = z.infer<typeof CommissionReportTotalsSchema>;

/**
 * Отчёт по комиссиям за период. Бронь относится к периоду по дате ЗАЕЗДА (check-in ∈ [from, to)) —
 * комиссия начисляется по факту брони, а не пропорционально ночам (в отличие от отчёта по загрузке).
 */
export const CommissionReportSchema = z.object({
  from: dateString,
  to: dateString,
  currency: z.string(),
  rows: z.array(CommissionReportRowSchema),
  totals: CommissionReportTotalsSchema,
});
export type CommissionReport = z.infer<typeof CommissionReportSchema>;

export const CommissionReportQuerySchema = z
  .object({ from: dateString, to: dateString })
  .refine((v) => v.from < v.to, { message: 'Конец периода должен быть позже начала' });
export type CommissionReportQuery = z.infer<typeof CommissionReportQuerySchema>;
