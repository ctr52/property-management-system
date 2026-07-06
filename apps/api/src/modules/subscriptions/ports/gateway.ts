import type { ResultAsync } from 'neverthrow';

/**
 * Платёжный шлюз подписки (SaaS-биллинг тенанта). Отделён от провайдеров платежей броней.
 * Два независимых сценария сбора карты, каждый — отдельная операция (без auth-hold):
 *  - привязка карты БЕЗ списания (zero-amount, ЮKassa /payment_methods) — триал require_card_first;
 *  - прямая оплата периода (charge стоимости плана + сохранение карты) — оплата подписки.
 * Оба возвращают redirect на хостед-страницу шлюза; подтверждение приходит вебхуком (без подписи →
 * источник правды re-fetch у шлюза).
 */

/** Инструкция пользователю — redirect на хостед-страницу шлюза (привязка/оплата). */
export type RedirectInstruction = {
  readonly kind: 'redirect';
  readonly url: string;
  /** id сессии у шлюза: payment_method_id (привязка) либо payment_id (оплата) — матч по вебхуку. */
  readonly externalId: string;
};

export type BindCardIntent = {
  readonly orgId: string;
  readonly planId: string;
  /** Куда вернуть пользователя после привязки карты (наш фронт). */
  readonly returnUrl: string;
  readonly idempotencyKey: string;
};

export type CheckoutPeriodIntent = {
  readonly orgId: string;
  readonly planId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly returnUrl: string;
  readonly idempotencyKey: string;
};

export type BillingError = {
  readonly code: 'gateway_error';
  readonly message: string;
};

/** Статус привязки карты: pending (ждём ввод) | active (карта сохранена) | failed. */
export type CardBindingStatus = 'pending' | 'active' | 'failed';

export type CardBinding = {
  readonly status: CardBindingStatus;
  /** Псевдо-отпечаток карты для card-ledger («одна карта = один триал»). */
  readonly cardFingerprint: string | null;
  /** id сохранённого способа оплаты (для будущего автобиллинга). null пока не active. */
  readonly paymentMethodId: string | null;
};

/** Статус оплаты периода: pending (ждём ввод) | succeeded (оплачено) | canceled (отклонено). */
export type PeriodPaymentStatus = 'pending' | 'succeeded' | 'canceled';

export type PeriodPayment = {
  readonly status: PeriodPaymentStatus;
  readonly cardFingerprint: string | null;
  /** id сохранённого способа оплаты (карта сохранена при оплате → автобиллинг далее). */
  readonly paymentMethodId: string | null;
};

/** Списание по сохранённой карте (автобиллинг / синхронная оплата при карте на файле). */
export type ChargeParams = {
  readonly methodRef: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly description: string;
  /** Идемпотентность: один ключ → одно списание (защита от двойного автобиллинга при ретрае). */
  readonly idempotencyKey: string;
};

/**
 * Исход списания — БИЗНЕС-результат (succeeded|declined), отделён от технического сбоя:
 * `declined` (карта отклонена) → триал лапсится; `err(BillingError)` (сеть/шлюз) → повтор позже.
 */
export type ChargeResult = { readonly status: 'succeeded' | 'declined' };

export type BillingGateway = {
  /** Привязать карту БЕЗ списания (zero-amount binding). Триал require_card_first. */
  readonly bindCard: (intent: BindCardIntent) => ResultAsync<RedirectInstruction, BillingError>;
  /** Свериться по привязке карты (источник правды — re-fetch у шлюза). */
  readonly getCardBinding: (bindingId: string) => ResultAsync<CardBinding, BillingError>;
  /** Прямая оплата периода: списать стоимость плана + сохранить карту для автобиллинга. */
  readonly checkoutPeriod: (intent: CheckoutPeriodIntent) => ResultAsync<RedirectInstruction, BillingError>;
  /** Свериться по оплате периода (источник правды — re-fetch у шлюза). */
  readonly getPeriodPayment: (paymentId: string) => ResultAsync<PeriodPayment, BillingError>;
  /** Списать по сохранённой карте (автоконвертация триала / синхронная оплата при карте на файле). */
  readonly charge: (params: ChargeParams) => ResultAsync<ChargeResult, BillingError>;
};
