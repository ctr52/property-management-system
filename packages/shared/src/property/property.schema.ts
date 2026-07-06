import { z } from 'zod';

/** Время в формате HH:MM (24ч). */
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ожидается время HH:MM');

export const DEFAULT_CHECK_IN = '14:00';
export const DEFAULT_CHECK_OUT = '12:00';

/**
 * Объект размещения (квартира / апартамент / номер).
 * Деньги храним в minor units (копейки), целыми числами — без float.
 */
export const PropertySchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string().min(1),
  address: z.string().min(1),
  basePriceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  checkInTime: timeOfDay,
  checkOutTime: timeOfDay,
  createdAt: z.string().datetime(),
});

export type Property = z.infer<typeof PropertySchema>;

/** Вход на создание объекта (то, что присылает клиент). */
export const CreatePropertyInputSchema = z.object({
  title: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  basePriceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).default('RUB'),
  checkInTime: timeOfDay.default(DEFAULT_CHECK_IN),
  checkOutTime: timeOfDay.default(DEFAULT_CHECK_OUT),
});

export type CreatePropertyInput = z.infer<typeof CreatePropertyInputSchema>;
/** То, что ШЛЁТ клиент: поля с `.default()` (currency, время) опциональны. */
export type CreatePropertyRequest = z.input<typeof CreatePropertyInputSchema>;

/** Правка объекта: любое подмножество полей. Минимум одно поле. */
export const UpdatePropertyInputSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    address: z.string().min(1).max(500).optional(),
    basePriceMinor: z.number().int().nonnegative().optional(),
    checkInTime: timeOfDay.optional(),
    checkOutTime: timeOfDay.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Нужно изменить хотя бы одно поле',
  });

export type UpdatePropertyInput = z.infer<typeof UpdatePropertyInputSchema>;
