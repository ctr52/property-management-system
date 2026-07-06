import { z } from 'zod';
import { ReservationStatusSchema } from '../reservation/reservation.schema';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

/** Публичная карточка объекта для гостя (без внутренних данных). */
export const GuestPropertySchema = z.object({
  title: z.string(),
  address: z.string(),
  checkInTime: z.string(),
  checkOutTime: z.string(),
});
export type GuestProperty = z.infer<typeof GuestPropertySchema>;

/** Нога оплаты, доступная гостю к оплате (provider-leg, ещё не оплачена). */
export const GuestPayableSchema = z.object({
  legId: z.string().uuid(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string(),
  provider: z.string(),
});
export type GuestPayable = z.infer<typeof GuestPayableSchema>;

/**
 * Гостевая страница (доступ по неугадываемому token'у, без авторизации).
 * accessCode раскрывается только для подтверждённой (firm) брони — мягкий захват кода не выдаёт.
 */
export const GuestViewSchema = z.object({
  guestName: z.string(),
  checkIn: dateString,
  checkOut: dateString,
  status: ReservationStatusSchema,
  property: GuestPropertySchema,
  accessCode: z.string().nullable(),
  payable: GuestPayableSchema.nullable(),
});
export type GuestView = z.infer<typeof GuestViewSchema>;
