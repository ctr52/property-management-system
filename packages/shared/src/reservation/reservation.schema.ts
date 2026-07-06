import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

/** Откуда бронь. direct — через нашу платформу; остальное — каналы. */
export const ReservationSourceSchema = z.enum(['direct', 'avito', 'cian']);
export type ReservationSource = z.infer<typeof ReservationSourceSchema>;

// conflict — бронь пришла с площадки, но даты уже заняты (овербукинг между каналами): hold не взят.
// pending — мягкий захват (tentative hold, ждёт оплату/подтверждение); expired — TTL истёк;
// preempted — вытеснена firm-бронью (кто-то подтвердил/оплатил те же даты).
export const ReservationStatusSchema = z.enum([
  'pending',
  'confirmed',
  'cancelled',
  'conflict',
  'expired',
  'preempted',
]);
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

export const ReservationViewSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  checkIn: dateString,
  checkOut: dateString,
  guestName: z.string(),
  guestContact: z.string().nullable(),
  source: ReservationSourceSchema,
  status: ReservationStatusSchema,
  amountMinor: z.number().int(),
  currency: z.string(),
  /** Токен гостевой страницы (для шеринга ссылки сотрудником). */
  guestToken: z.string(),
});
export type ReservationView = z.infer<typeof ReservationViewSchema>;

/** Создать бронь вручную (через платформу). Интервал полуоткрытый [checkIn, checkOut). */
export const CreateReservationInputSchema = z
  .object({
    propertyId: z.string().uuid(),
    checkIn: dateString,
    checkOut: dateString,
    guestName: z.string().min(1).max(200),
    guestContact: z.string().max(200).optional(),
    amountMinor: z.number().int().nonnegative().default(0),
    currency: z.string().length(3).default('RUB'),
  })
  .refine((v) => v.checkIn < v.checkOut, { message: 'Выезд должен быть позже заезда' });
export type CreateReservationInput = z.infer<typeof CreateReservationInputSchema>;
/** То, что ШЛЁТ клиент: поля с `.default()` опциональны. */
export type CreateReservationRequest = z.input<typeof CreateReservationInputSchema>;
