import type { ResultAsync } from 'neverthrow';
import type { PaymentProvider, PaymentStatus, ProviderManifest } from '@pms/shared';
import type {
  PaymentCapabilities,
  PaymentError,
  PaymentEvent,
  PaymentInstruction,
  PaymentIntent,
} from '../domain/types';

/**
 * Подключённый платёжный аккаунт организации. Креды лежат в vault по credentialsRef.
 * config — несекретный конфиг аккаунта (для generic: endpointUrl, signatureAlgo, бренд).
 * Для first-party обычно пуст.
 */
export type PaymentAccount = {
  readonly id: string;
  readonly orgId: string;
  readonly provider: PaymentProvider;
  readonly status: 'active' | 'disabled';
  readonly credentialsRef: string | null;
  readonly config: Readonly<Record<string, string>>;
  readonly createdAt: string;
};

export type RawWebhookRequest = {
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
};

export type Sink<E> = (events: readonly E[]) => Promise<void>;
export type Unsubscribe = () => Promise<void>;
export type Cursor = string | null;
export type PollResult<E> = { readonly events: readonly E[]; readonly cursor: Cursor };

/**
 * Приём входящих подтверждений оплаты. Симметрия IngestionStrategy каналов:
 * push (Robokassa ResultURL) / poll (страховочный опрос статуса) / none.
 * Потребитель этого не видит — единый Payment Ingestion Runner сводит оба режима
 * в нормализованный стор идемпотентно по externalId.
 */
export type PaymentIngestion =
  | {
      readonly mode: 'push';
      readonly subscribe: (account: PaymentAccount, sink: Sink<PaymentEvent>) => Promise<Unsubscribe>;
    }
  | {
      readonly mode: 'poll';
      readonly intervalSec: number;
      readonly poll: (account: PaymentAccount, cursor: Cursor) => ResultAsync<PollResult<PaymentEvent>, PaymentError>;
    }
  | { readonly mode: 'none' };

/**
 * Адаптер платёжного провайдера: декларирует возможности и реализует подмножество операций.
 * Опциональные методы = «не поддерживается этим провайдером».
 */
export type PaymentProviderAdapter = {
  readonly provider: PaymentProvider;
  /** Самоописание провайдера для GET /payments/providers (рельс + data-driven форма подключения). */
  readonly manifest: ProviderManifest;
  readonly capabilities: PaymentCapabilities;
  /** Инициировать платёж → инструкция гостю (redirect на hosted-страницу). */
  readonly initPayment: (account: PaymentAccount, intent: PaymentIntent) => ResultAsync<PaymentInstruction, PaymentError>;
  /** Приём результата оплаты (push/poll). */
  readonly ingest: PaymentIngestion;
  /**
   * Проверка подписи входящего вебхука. Принимает account: подпись считается секретом
   * КОНКРЕТНОГО аккаунта (generic — secretKey из vault, Robokassa — Password#2 мерчанта),
   * поэтому ResultAsync (резолв секрета асинхронный). Битое/чужое → err, обработчик молчит.
   */
  readonly verifyWebhook?: (account: PaymentAccount, req: RawWebhookRequest) => ResultAsync<void, PaymentError>;
  /** Разбор вебхука в нормализованные события (в контексте аккаунта). */
  readonly parseWebhook?: (account: PaymentAccount, req: RawWebhookRequest) => ResultAsync<readonly PaymentEvent[], PaymentError>;
  /** Страховочный запрос статуса по externalId (если у провайдера есть). */
  readonly getStatus?: (account: PaymentAccount, externalId: string) => ResultAsync<PaymentStatus, PaymentError>;
  /** Возврат (полный/частичный). Идемпотентно по нашему ключу. */
  readonly refund?: (account: PaymentAccount, externalId: string, amountMinor: number) => ResultAsync<void, PaymentError>;
};
