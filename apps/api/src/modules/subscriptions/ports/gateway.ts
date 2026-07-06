import type { ResultAsync } from 'neverthrow';

/**
 * Платёжный шлюз подписки (SaaS-биллинг тенанта). Отделён от провайдеров платежей броней
 * (`payments/ports/provider.ts`): там оплата гостем разовая, здесь — привязка карты на файле
 * с auth-hold для верификации и (далее) рекуррентное списание.
 *
 * Для ветки require_card_first ([[trial-policy]]): карта проверяется auth-hold'ом (₽1–₽10 → void),
 * а не charge+refund. Подтверждение холда приходит асинхронно (вебхук) — тогда и стартует
 * trialing(withCard:true) и фиксируется отпечаток карты в ledger.
 */

/** Инструкция пользователю — куда идти привязывать карту. Пока единственный режим — redirect. */
export type SetupInstruction = {
  readonly kind: 'redirect';
  readonly url: string;
  /** id сессии настройки у провайдера — чтобы сматчить подтверждение auth-hold по вебхуку. */
  readonly externalId?: string;
};

export type SetupPaymentMethodIntent = {
  readonly orgId: string;
  readonly planId: string;
  /** Куда вернуть пользователя после привязки карты (наш фронт). */
  readonly returnUrl: string;
  /** Идемпотентность исходящего: один ключ → одна сессия настройки. */
  readonly idempotencyKey: string;
};

export type BillingError = {
  readonly code: 'gateway_error';
  readonly message: string;
};

/** Статус проверочного холда: pending (ждём ввод карты) | held (карта подтверждена, холд стоит) | failed. */
export type CardSetupStatus = 'pending' | 'held' | 'failed';

export type CardSetupResult = {
  readonly status: CardSetupStatus;
  /** Псевдо-отпечаток карты для card-ledger («одна карта = один триал»). */
  readonly cardFingerprint: string | null;
  /** id сохранённого способа оплаты для будущего автобиллинга. */
  readonly paymentMethodId: string | null;
};

/** Списание по сохранённой карте (автобиллинг). */
export type ChargeParams = {
  /** Ссылка шлюза на сохранённый способ оплаты (Subscription.billingMethodRef). */
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
  /** Запустить привязку карты с auth-hold для верификации. Возврат — redirect-инструкция. */
  readonly setupPaymentMethod: (
    intent: SetupPaymentMethodIntent,
  ) => ResultAsync<SetupInstruction, BillingError>;
  /** Свериться по статусу холда (источник правды — re-fetch у шлюза, не тело вебхука). */
  readonly getSetupResult: (paymentId: string) => ResultAsync<CardSetupResult, BillingError>;
  /** Снять холд (вернуть заморозку) — деньги с клиента не списываются, карта остаётся сохранённой. */
  readonly releaseHold: (paymentId: string, idempotencyKey: string) => ResultAsync<void, BillingError>;
  /** Списать по сохранённой карте (автоконвертация триала в платный). */
  readonly charge: (params: ChargeParams) => ResultAsync<ChargeResult, BillingError>;
};
