import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

/** Что занимает даты. Бронь / ручная блокировка / уборка. */
export const HoldKindSchema = z.enum(['reservation', 'block', 'cleaning']);
export type HoldKind = z.infer<typeof HoldKindSchema>;

/**
 * Тир холда — компромисс против гриферства inventory:
 *  - firm      — подтверждённый (оплата/депозит/сотрудник/канал-confirmed), без срока, жёсткий инвариант;
 *  - tentative — мягкий захват (заявка/checkout), с TTL (expiresAt), истекает и ВЫТЕСНЯЕТСЯ firm'ом.
 * Инвариант: два firm не пересекаются; firm бьёт неистёкший tentative; tentative не лезет на активный.
 */
export const HoldTierSchema = z.enum(['tentative', 'firm']);
export type HoldTier = z.infer<typeof HoldTierSchema>;

/** Представление занятости для клиента. Интервал полуоткрытый: ночи [from, to). */
export const AvailabilityHoldViewSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  from: dateString,
  to: dateString,
  kind: HoldKindSchema,
  note: z.string().nullable(),
});
export type AvailabilityHoldView = z.infer<typeof AvailabilityHoldViewSchema>;

/** Владелец закрывает даты (ремонт/личное). Интервал полуоткрытый, to > from. */
export const CreateBlockInputSchema = z
  .object({
    propertyId: z.string().uuid(),
    from: dateString,
    to: dateString,
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.from < v.to, { message: 'Дата конца должна быть позже начала' });
export type CreateBlockInput = z.infer<typeof CreateBlockInputSchema>;
