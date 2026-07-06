import { z } from 'zod';
import { PlatformSchema } from '../channel/channel.schema';

/**
 * Контракты платёжного модуля (end-to-end типобезопасность фронт↔бэк).
 * Нейтральны к провайдеру: Robokassa/ЮKassa/CloudPayments — реализации одного порта.
 * Деньги — всегда в minor units (целые копейки), без float.
 *
 * Ключевая модель — НЕ «платёж за бронь», а «план оплаты из ног (legs)»: сумма за бронь
 * бьётся на части, и у каждой части свой сборщик (collector) — площадка или наш провайдер.
 */

/**
 * Идентификатор платёжного провайдера = id адаптера-СТРАТЕГИИ (рельса), не бренда (см. ADR-0002).
 * Открытая строка, а не enum: новый рельс подключается через registry + манифест, без правки
 * shared-типа и перекомпиляции фронта.
 *  - first-party — 1:1 с брендом ('robokassa', позже 'yookassa');
 *  - generic — id стратегии ('generic-hosted-link', 'manual'); конкретный бренд живёт в
 *    PaymentAccount, один адаптер обслуживает много брендов через разные аккаунты.
 * Валидность id проверяется в рантайме резолвом в PaymentProviderRegistry, не типом.
 */
export const PaymentProviderSchema = z.string().min(1);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

/** Назначение ноги оплаты. */
export const PaymentPurposeSchema = z.enum(['prepayment', 'balance', 'deposit']);
export type PaymentPurpose = z.infer<typeof PaymentPurposeSchema>;

/**
 * Кто собирает деньги по этой ноге:
 *  - channel  — собирает площадка (Циан-предоплата, часть через Авито). Мы НЕ инициируем,
 *               только СВЕРЯЕМ статус из нормализованного ingestion каналов.
 *  - provider — собираем мы через платёжного провайдера. Мы ИНИЦИИРУЕМ платёж и ловим вебхук.
 */
export const PaymentCollectorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('channel'), platform: PlatformSchema }),
  z.object({ kind: z.literal('provider'), provider: PaymentProviderSchema }),
]);
export type PaymentCollector = z.infer<typeof PaymentCollectorSchema>;

/** Статус отдельной ноги (агрегированный, виден гостю/арендодателю). */
export const PaymentLegStatusSchema = z.enum(['pending', 'paid', 'failed', 'refunded']);
export type PaymentLegStatus = z.infer<typeof PaymentLegStatusSchema>;

/** Одна нога плана оплаты. */
export const PaymentLegSchema = z.object({
  id: z.string().uuid(),
  purpose: PaymentPurposeSchema,
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  collector: PaymentCollectorSchema,
  status: PaymentLegStatusSchema,
  /** Заполняется только для provider-ног — ссылка на наш Payment, исполняющий ногу. */
  paymentId: z.string().uuid().nullable(),
});
export type PaymentLeg = z.infer<typeof PaymentLegSchema>;

/** План оплаты брони: сумма + раскладка на ноги. Сумма ног обязана сходиться с total. */
export const PaymentPlanSchema = z.object({
  reservationId: z.string().uuid(),
  currency: z.string().length(3),
  totalMinor: z.number().int().nonnegative(),
  legs: z.array(PaymentLegSchema),
});
export type PaymentPlan = z.infer<typeof PaymentPlanSchema>;

/** Статус нашего Payment (исполнение provider-ноги). Полнее, чем у ноги: ведём весь жизненный цикл. */
export const PaymentStatusSchema = z.enum([
  'created',
  'pending',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/** Представление нашего платежа для клиента (только provider-ноги). */
export const PaymentViewSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  reservationId: z.string().uuid(),
  legId: z.string().uuid(),
  provider: PaymentProviderSchema,
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: PaymentStatusSchema,
  createdAt: z.string().datetime(),
});
export type PaymentView = z.infer<typeof PaymentViewSchema>;

/** Запрос инициации оплаты конкретной provider-ноги (с гостевого портала/кабинета). */
export const InitPaymentInputSchema = z.object({
  reservationId: z.string().uuid(),
  legId: z.string().uuid(),
});
export type InitPaymentInput = z.infer<typeof InitPaymentInputSchema>;

/**
 * Результат инициации: куда отправить гостя. Robokassa — hosted-страница (redirect).
 * Фронт делает редирект; на площадки/провайдера он не ходит — только на наш бэкенд.
 */
export const PaymentInitResultSchema = z.object({
  paymentId: z.string().uuid(),
  redirectUrl: z.string().url(),
});
export type PaymentInitResult = z.infer<typeof PaymentInitResultSchema>;

/**
 * Возможности провайдера (client-facing зеркало домен-типа PaymentCapabilities).
 * Фронт по нему мягко деградирует UI (нет refunds → нет кнопки возврата).
 */
export const PaymentCapabilitiesSchema = z.object({
  refunds: z.boolean(),
  recurring: z.boolean(),
  /** Фискальные чеки (54-ФЗ) на стороне провайдера. */
  receipts: z.boolean(),
  /** Как провайдер отдаёт входящие подтверждения. */
  ingest: z.enum(['push', 'poll', 'none']),
});
export type PaymentCapabilities = z.infer<typeof PaymentCapabilitiesSchema>;

/** Одно поле data-driven формы подключения. Секретные уходят в vault, остальные — в конфиг аккаунта. */
export const ConnectFieldSpecSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  /** secret → в SecretVault и не возвращается клиенту; иначе — публичный конфиг (endpointUrl, бренд). */
  secret: z.boolean(),
  required: z.boolean(),
  kind: z.enum(['text', 'url', 'select', 'textarea']).default('text'),
  /** Допустимые значения для kind='select' (например, алгоритм подписи generic-провайдера). */
  options: z.array(z.string()).optional(),
  /** Расширенное поле — на форме прячется под «Расширенные настройки» (есть разумный дефолт). */
  advanced: z.boolean().optional(),
  /** Подсказка/значение по умолчанию (показывается в placeholder). */
  hint: z.string().optional(),
});
export type ConnectFieldSpec = z.infer<typeof ConnectFieldSpecSchema>;

/** Тип адаптера-стратегии за провайдером (см. ADR-0002). */
export const ProviderKindSchema = z.enum(['first-party', 'generic-hosted-link', 'manual']);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

/**
 * Самоописание провайдера. Registry отдаёт список манифестов; из них строятся и перечень рельсов,
 * и форма подключения. Добавление провайдера не трогает ни этот shared-файл, ни UI.
 */
export const ProviderManifestSchema = z.object({
  id: PaymentProviderSchema,
  title: z.string().min(1),
  kind: ProviderKindSchema,
  capabilities: PaymentCapabilitiesSchema,
  connectSchema: z.array(ConnectFieldSpecSchema),
});
export type ProviderManifest = z.infer<typeof ProviderManifestSchema>;

/**
 * Подключение провайдера организацией. Нейтральная форма вместо захардкоженного union:
 * credentials валидируются use-case'ом против connectSchema манифеста в рантайме. Секретные поля
 * уходят в vault, несекретные — в конфиг аккаунта (как у каналов).
 */
export const ConnectProviderInputSchema = z.object({
  provider: PaymentProviderSchema,
  credentials: z.record(z.string(), z.string()),
});
export type ConnectProviderInput = z.infer<typeof ConnectProviderInputSchema>;

/** Представление подключённого платёжного аккаунта для клиента (без секретов). */
export const PaymentAccountViewSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  provider: PaymentProviderSchema,
  title: z.string(),
  status: z.enum(['active', 'disabled']),
  hasCredentials: z.boolean(),
  /** Несекретный конфиг (для generic: endpointUrl, бренд) — отдаём как есть. */
  config: z.record(z.string(), z.string()),
  /**
   * URL вебхука (ResultURL) для push-провайдеров — арендодатель копирует его в настройки своей
   * платёжной системы (куда она шлёт уведомление об оплате). null, если вебхука нет (manual).
   */
  webhookUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PaymentAccountView = z.infer<typeof PaymentAccountViewSchema>;

/**
 * Прямой план оплаты (бронь без площадки): вся сумма — одна provider-нога.
 * Площадко-зависимую раскладку даёт ChannelSplitSource (см. ADR-0001) и отдельный поток;
 * здесь — нейтральный вход, не тянущий модули channel/reservation.
 */
export const BuildDirectPlanInputSchema = z.object({
  reservationId: z.string().uuid(),
  provider: PaymentProviderSchema,
  totalMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type BuildDirectPlanInput = z.infer<typeof BuildDirectPlanInputSchema>;

/** Ручное подтверждение оплаты (manual-провайдер): закрывает provider-ногу руками менеджера. */
export const ConfirmManualPaymentInputSchema = z.object({
  reservationId: z.string().uuid(),
  legId: z.string().uuid(),
});
export type ConfirmManualPaymentInput = z.infer<typeof ConfirmManualPaymentInputSchema>;
