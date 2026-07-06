import { z } from 'zod';

/**
 * Контракты подписки (SaaS-биллинг тенанта) — end-to-end типобезопасность фронт↔бэк.
 * Не путать с payment.schema (оплата броней гостем). Деньги — minor units.
 */

export const SubscriptionStatusSchema = z.enum(['trialing', 'active', 'expired', 'canceled']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/** Представление подписки для UI. */
export const SubscriptionViewSchema = z.object({
  planId: z.string(),
  status: SubscriptionStatusSchema,
  trialEndsAt: z.string().nullable(),
  paymentMethodAttached: z.boolean(),
  currentPeriodEnd: z.string().nullable(),
  /** Доступ только на чтение (триал истёк/подписка отменена). Гейтит запись на фронте. */
  readOnly: z.boolean(),
});
export type SubscriptionView = z.infer<typeof SubscriptionViewSchema>;

/** Тарифный план для витрины биллинга (что org платит нам). Деньги — minor units. */
export const PlanViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceMinor: z.number().int(),
  currency: z.string(),
  trialDays: z.number().int(),
  periodDays: z.number().int(),
});
export type PlanView = z.infer<typeof PlanViewSchema>;

/**
 * Вход в подписку. phoneVerified НЕ принимаем от клиента (проверяется на сервере),
 * ip — тоже берётся из запроса сервером, не из тела.
 */
export const SubscribeInputSchema = z.object({
  planId: z.string().min(1),
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Телефон в формате E.164 (+7...)'),
  /** Куда вернуть пользователя после привязки карты (ветка require_card_first). */
  returnUrl: z.string().url(),
  /** Мягкие сигналы для скоринга риска (опциональны). */
  deviceFingerprint: z.string().optional(),
  emailDomain: z.string().optional(),
});
export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

/**
 * Итог попытки подписки (дискриминированный union):
 *  - trial_started — выдан cardless-триал;
 *  - card_required — нужна привязка карты (auth-hold): фронт редиректит на setupUrl;
 *  - rejected — политика отказала (нет подтверждённого телефона).
 */
export const SubscribeResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('trial_started'), subscription: SubscriptionViewSchema }),
  z.object({ kind: z.literal('card_required'), setupUrl: z.string(), reason: z.string() }),
  z.object({ kind: z.literal('rejected'), reason: z.string() }),
]);
export type SubscribeResult = z.infer<typeof SubscribeResultSchema>;

/** Куда вернуть пользователя после привязки карты при оплате периода (ветка без карты на файле). */
export const PayInputSchema = z.object({ returnUrl: z.string().url() });
export type PayInput = z.infer<typeof PayInputSchema>;

/**
 * Итог оплаты периода (из любого статуса: продление триала/active ИЛИ реактивация из read-only):
 *  - paid     — карта на файле, списание прошло, подписка active (дата конца продлена);
 *  - declined — карта на файле отклонена (нужна другая);
 *  - redirect — карты нет → редирект на прямую оплату (redirectUrl), продление замкнётся на вебхуке.
 */
export const PayResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paid'), subscription: SubscriptionViewSchema }),
  z.object({ kind: z.literal('declined') }),
  z.object({ kind: z.literal('redirect'), redirectUrl: z.string() }),
]);
export type PayResult = z.infer<typeof PayResultSchema>;
