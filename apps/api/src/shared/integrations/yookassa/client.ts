import { errAsync, okAsync, ResultAsync } from 'neverthrow';

/**
 * Низкоуровневый протокол-клиент ЮMoney/ЮKassa (acquiring API v3). ОБЩИЙ ШОВ переиспользования:
 * один клиент обслуживает оба сценария, отличаясь лишь кредами магазина (см. credentials):
 *  - оплата броней арендаторами → магазин арендодателя (модуль payments, PaymentProviderAdapter);
 *  - оплата подписки арендодателем → НАШ магазин (модуль subscriptions, BillingGateway).
 *
 * Клиент не знает ни про броню, ни про подписку — только ЮKassa REST. Доменные адаптеры поверх.
 * Транспорт инъектируется (HttpJson) → юнит-тесты без сети.
 *
 * ВНИМАНИЕ: форма ответов выверена по докам ЮKassa v3, но боевое поведение (особенно сохранение
 * карты на двухстадийном `capture:false` платеже) сверить с продом — см. billing-gateway.
 */

/** Креды конкретного магазина: HTTP Basic base64(shopId:secretKey). */
export type YooKassaCredentials = {
  readonly shopId: string;
  readonly secretKey: string;
};

export type YooKassaError = {
  readonly code: 'yookassa_error';
  readonly message: string;
  readonly status?: number;
};

/** Инъектируемый транспорт. Дефолт — createFetchHttpJson (global fetch). */
export type HttpJson = (req: {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}) => ResultAsync<{ readonly status: number; readonly json: unknown }, YooKassaError>;

export type YooKassaPaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';

/** Реквизиты карты от ЮKassa (для псевдо-отпечатка «одна карта = один триал» в ledger). */
export type YooKassaCard = {
  readonly first6: string | null;
  readonly last4: string | null;
  readonly expiryYear: string | null;
  readonly expiryMonth: string | null;
};

/** Нормализованный платёж ЮKassa (не зависит от формата DTO). */
export type YooKassaPayment = {
  readonly id: string;
  readonly status: YooKassaPaymentStatus;
  readonly paid: boolean;
  readonly amountMinor: number;
  readonly currency: string;
  /** URL подтверждения (redirect) — пока платёж pending и ждёт ввода карты. */
  readonly confirmationUrl: string | null;
  /** id сохранённого способа оплаты (для рекуррентных списаний). */
  readonly paymentMethodId: string | null;
  readonly paymentMethodSaved: boolean;
  readonly card: YooKassaCard | null;
};

/** Статус сохранённого способа оплаты (zero-amount привязка карты без списания). */
export type YooKassaPaymentMethodStatus = 'pending' | 'active' | 'inactive';

/** Нормализованный способ оплаты ЮKassa (объект /payment_methods) для привязки карты без списания. */
export type YooKassaPaymentMethod = {
  readonly id: string;
  readonly status: YooKassaPaymentMethodStatus;
  /** URL подтверждения (redirect) — пока привязка pending и ждёт ввода карты. */
  readonly confirmationUrl: string | null;
  readonly card: YooKassaCard | null;
};

export type CreatePaymentParams = {
  readonly amountMinor: number;
  readonly currency: string;
  /** false → двухстадийный (auth-hold): деньги замораживаются до capture/cancel. */
  readonly capture: boolean;
  /** Куда вернуть браузер после подтверждения карты (для redirect-флоу; не нужен при paymentMethodId). */
  readonly returnUrl?: string;
  readonly description: string;
  /** Сохранить карту для будущих рекуррентных списаний. */
  readonly savePaymentMethod?: boolean;
  /** Списать ранее сохранённую карту (рекуррент) — без redirect. */
  readonly paymentMethodId?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  /** Идемпотентность: один ключ → один платёж у ЮKassa. */
  readonly idempotencyKey: string;
};

export type YooKassaClient = {
  readonly createPayment: (
    credentials: YooKassaCredentials,
    params: CreatePaymentParams,
  ) => ResultAsync<YooKassaPayment, YooKassaError>;
  /** Списать ранее захолдированный двухстадийный платёж. */
  readonly capturePayment: (
    credentials: YooKassaCredentials,
    paymentId: string,
    idempotencyKey: string,
  ) => ResultAsync<YooKassaPayment, YooKassaError>;
  /** Отменить платёж / снять auth-hold (вернуть заморозку). */
  readonly cancelPayment: (
    credentials: YooKassaCredentials,
    paymentId: string,
    idempotencyKey: string,
  ) => ResultAsync<YooKassaPayment, YooKassaError>;
  /** Свериться по платежу (вебхуки ЮKassa без подписи → источник правды re-fetch). */
  readonly getPayment: (
    credentials: YooKassaCredentials,
    paymentId: string,
  ) => ResultAsync<YooKassaPayment, YooKassaError>;
  /** Привязать карту БЕЗ списания (zero-amount, POST /payment_methods) → redirect + payment_method_id. */
  readonly createPaymentMethod: (
    credentials: YooKassaCredentials,
    params: { readonly returnUrl: string; readonly idempotencyKey: string },
  ) => ResultAsync<YooKassaPaymentMethod, YooKassaError>;
  /** Свериться по привязке карты (payment_method.active приходит вебхуком без подписи). */
  readonly getPaymentMethod: (
    credentials: YooKassaCredentials,
    paymentMethodId: string,
  ) => ResultAsync<YooKassaPaymentMethod, YooKassaError>;
};

const minorToValue = (amountMinor: number): string => (amountMinor / 100).toFixed(2);
const valueToMinor = (value: string): number => Math.round(Number(value) * 100);

const authHeader = (c: YooKassaCredentials): string =>
  `Basic ${Buffer.from(`${c.shopId}:${c.secretKey}`).toString('base64')}`;

/** Чистый маппер DTO ЮKassa → нормализованный платёж. Тестируется отдельно. */
export const toPayment = (dto: unknown): YooKassaPayment | null => {
  if (typeof dto !== 'object' || dto === null) return null;
  const d = dto as Record<string, unknown>;
  const id = typeof d.id === 'string' ? d.id : null;
  const status = d.status as YooKassaPaymentStatus | undefined;
  if (!id || !status) return null;

  const amount = (d.amount ?? {}) as Record<string, unknown>;
  const confirmation = (d.confirmation ?? {}) as Record<string, unknown>;
  const method = (d.payment_method ?? null) as Record<string, unknown> | null;
  const card = (method?.card ?? null) as Record<string, unknown> | null;

  return {
    id,
    status,
    paid: d.paid === true,
    amountMinor: valueToMinor(String(amount.value ?? '0')),
    currency: String(amount.currency ?? 'RUB'),
    confirmationUrl: typeof confirmation.confirmation_url === 'string' ? confirmation.confirmation_url : null,
    paymentMethodId: typeof method?.id === 'string' ? method.id : null,
    paymentMethodSaved: method?.saved === true,
    card: card
      ? {
          first6: typeof card.first6 === 'string' ? card.first6 : null,
          last4: typeof card.last4 === 'string' ? card.last4 : null,
          expiryYear: typeof card.expiry_year === 'string' ? card.expiry_year : null,
          expiryMonth: typeof card.expiry_month === 'string' ? card.expiry_month : null,
        }
      : null,
  };
};

/** Чистый маппер DTO способа оплаты (/payment_methods) → нормализованная привязка карты. */
export const toPaymentMethod = (dto: unknown): YooKassaPaymentMethod | null => {
  if (typeof dto !== 'object' || dto === null) return null;
  const d = dto as Record<string, unknown>;
  const id = typeof d.id === 'string' ? d.id : null;
  const status = d.status as YooKassaPaymentMethodStatus | undefined;
  if (!id || !status) return null;

  const confirmation = (d.confirmation ?? {}) as Record<string, unknown>;
  const card = (d.card ?? null) as Record<string, unknown> | null;

  return {
    id,
    status,
    confirmationUrl: typeof confirmation.confirmation_url === 'string' ? confirmation.confirmation_url : null,
    card: card
      ? {
          first6: typeof card.first6 === 'string' ? card.first6 : null,
          last4: typeof card.last4 === 'string' ? card.last4 : null,
          expiryYear: typeof card.expiry_year === 'string' ? card.expiry_year : null,
          expiryMonth: typeof card.expiry_month === 'string' ? card.expiry_month : null,
        }
      : null,
  };
};

/** Дефолтный транспорт поверх global fetch. База фиксирована (api.yookassa.ru) → SSRF не релевантен. */
export const createFetchHttpJson = (): HttpJson => (req) =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(req.url, { method: req.method, headers: { ...req.headers }, body: req.body });
      const json = (await res.json().catch(() => ({}))) as unknown;
      return { status: res.status, json };
    })(),
    (e): YooKassaError => ({ code: 'yookassa_error', message: e instanceof Error ? e.message : 'Сбой запроса к ЮKassa' }),
  );

export type YooKassaClientDeps = {
  /** Прод `https://api.yookassa.ru/v3`. */
  readonly apiBase: string;
  readonly http: HttpJson;
};

export const createYooKassaClient = (deps: YooKassaClientDeps): YooKassaClient => {
  const post = (
    credentials: YooKassaCredentials,
    path: string,
    idempotencyKey: string,
    body: Record<string, unknown>,
  ): ResultAsync<YooKassaPayment, YooKassaError> =>
    deps
      .http({
        method: 'POST',
        url: `${deps.apiBase}${path}`,
        headers: {
          authorization: authHeader(credentials),
          'idempotence-key': idempotencyKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      .andThen(parseResponse);

  const parseResponse = (res: { status: number; json: unknown }): ResultAsync<YooKassaPayment, YooKassaError> => {
    if (res.status >= 400) {
      const e = res.json as { description?: string } | null;
      return errAsync({ code: 'yookassa_error', message: `ЮKassa вернула ${res.status}: ${e?.description ?? 'ошибка'}`, status: res.status });
    }
    const payment = toPayment(res.json);
    return payment ? okAsync(payment) : errAsync({ code: 'yookassa_error', message: 'Не удалось разобрать ответ ЮKassa' });
  };

  const parseMethodResponse = (res: { status: number; json: unknown }): ResultAsync<YooKassaPaymentMethod, YooKassaError> => {
    if (res.status >= 400) {
      const e = res.json as { description?: string } | null;
      return errAsync({ code: 'yookassa_error', message: `ЮKassa вернула ${res.status}: ${e?.description ?? 'ошибка'}`, status: res.status });
    }
    const method = toPaymentMethod(res.json);
    return method ? okAsync(method) : errAsync({ code: 'yookassa_error', message: 'Не удалось разобрать ответ ЮKassa' });
  };

  return {
    createPayment: (credentials, params) =>
      post(credentials, '/payments', params.idempotencyKey, {
        amount: { value: minorToValue(params.amountMinor), currency: params.currency },
        capture: params.capture,
        ...(params.paymentMethodId
          ? { payment_method_id: params.paymentMethodId }
          : { confirmation: { type: 'redirect', return_url: params.returnUrl } }),
        description: params.description,
        ...(params.savePaymentMethod ? { save_payment_method: true } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      }),

    capturePayment: (credentials, paymentId, idempotencyKey) =>
      post(credentials, `/payments/${paymentId}/capture`, idempotencyKey, {}),

    cancelPayment: (credentials, paymentId, idempotencyKey) =>
      post(credentials, `/payments/${paymentId}/cancel`, idempotencyKey, {}),

    getPayment: (credentials, paymentId) =>
      deps
        .http({
          method: 'GET',
          url: `${deps.apiBase}/payments/${paymentId}`,
          headers: { authorization: authHeader(credentials) },
        })
        .andThen(parseResponse),

    createPaymentMethod: (credentials, params) =>
      deps
        .http({
          method: 'POST',
          url: `${deps.apiBase}/payment_methods`,
          headers: {
            authorization: authHeader(credentials),
            'idempotence-key': params.idempotencyKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ type: 'bank_card', confirmation: { type: 'redirect', return_url: params.returnUrl } }),
        })
        .andThen(parseMethodResponse),

    getPaymentMethod: (credentials, paymentMethodId) =>
      deps
        .http({
          method: 'GET',
          url: `${deps.apiBase}/payment_methods/${paymentMethodId}`,
          headers: { authorization: authHeader(credentials) },
        })
        .andThen(parseMethodResponse),
  };
};
