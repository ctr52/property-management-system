import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { ProviderManifest } from '@pms/shared';
import type {
  YooKassaClient,
  YooKassaCredentials,
  YooKassaPaymentStatus,
} from '../../../../shared/integrations/yookassa/client';
import type { PaymentError, PaymentEvent } from '../../domain/types';
import type { PaymentAccount, PaymentProviderAdapter } from '../../ports/provider';

/**
 * ЮMoney/ЮKassa для оплаты БРОНЕЙ (арендатор → магазин арендодателя). Переиспользует тот же
 * общий протокол-клиент ([[yookassa-client]]), что и BillingGateway подписок — отличие лишь в
 * кредах (магазин арендодателя из vault) и сценарии (разовый capture:true с redirect).
 *
 * Вебхуки ЮKassa НЕ подписаны: verifyWebhook сверяется re-fetch'ем платежа по id (источник
 * правды — API ЮKassa, а не тело уведомления).
 */
export const YOOKASSA = 'yookassa';

const manifest: ProviderManifest = {
  id: YOOKASSA,
  title: 'ЮKassa',
  kind: 'first-party',
  capabilities: { refunds: true, recurring: true, receipts: true, ingest: 'push' },
  connectSchema: [
    { key: 'shopId', label: 'shopId (идентификатор магазина)', secret: false, required: true, kind: 'text' },
    { key: 'secretKey', label: 'Секретный ключ', secret: true, required: true, kind: 'text' },
  ],
};

const STATUS_OUTCOME: Readonly<Record<YooKassaPaymentStatus, PaymentEvent['outcome'] | null>> = {
  succeeded: 'succeeded',
  canceled: 'failed',
  waiting_for_capture: null, // промежуточный для двухстадийных — не финальное событие
  pending: null,
};

type Deps = {
  readonly client: YooKassaClient;
  readonly getSecret: (ref: string) => Promise<Record<string, string> | null>;
};

export const createYooKassaAdapter = (deps: Deps): PaymentProviderAdapter => {
  const credsOf = async (account: PaymentAccount): Promise<YooKassaCredentials | null> => {
    const shopId = account.config.shopId;
    if (!shopId || !account.credentialsRef) return null;
    const secret = await deps.getSecret(account.credentialsRef);
    return secret?.secretKey ? { shopId, secretKey: secret.secretKey } : null;
  };

  /** Из тела уведомления достаём id платежа (object.id) — всё остальное берём re-fetch'ем. */
  const eventPaymentId = (rawBody: string): string | null => {
    try {
      const body = JSON.parse(rawBody) as { object?: { id?: string } };
      return body.object?.id ?? null;
    } catch {
      return null;
    }
  };

  return {
    provider: YOOKASSA,
    manifest,
    capabilities: manifest.capabilities,

    initPayment: (account, intent) =>
      ResultAsync.fromSafePromise(credsOf(account)).andThen((creds) =>
        creds === null
          ? errAsync<{ kind: 'redirect'; url: string; externalId: string }, PaymentError>({
              code: 'provider_error',
              message: 'Креды ЮKassa недоступны (shopId/secretKey)',
            })
          : deps.client
              .createPayment(creds, {
                amountMinor: intent.amountMinor,
                currency: intent.currency,
                capture: true,
                returnUrl: intent.returnUrl,
                description: intent.description,
                metadata: { paymentId: intent.paymentId, orgId: intent.orgId },
                idempotencyKey: intent.idempotencyKey,
              })
              .mapErr((e): PaymentError => ({ code: 'provider_error', message: e.message }))
              .andThen((payment) =>
                payment.confirmationUrl
                  ? okAsync({ kind: 'redirect' as const, url: payment.confirmationUrl, externalId: payment.id })
                  : errAsync<{ kind: 'redirect'; url: string; externalId: string }, PaymentError>({
                      code: 'provider_error',
                      message: 'ЮKassa не вернула confirmation_url',
                    }),
              ),
      ),

    // Вебхук приходит на наш публичный роут; subscribe не используется (как у robokassa/tochka).
    ingest: { mode: 'push', subscribe: async () => async () => {} },

    // Подпись отсутствует → «верификация» = успешный re-fetch платежа по его id у ЮKassa.
    verifyWebhook: (account, req) =>
      ResultAsync.fromSafePromise(credsOf(account)).andThen((creds) => {
        const id = eventPaymentId(req.rawBody);
        if (creds === null || id === null) {
          return errAsync<void, PaymentError>({ code: 'signature_invalid', message: 'Нет кредов/id для сверки вебхука' });
        }
        return deps.client.getPayment(creds, id).map(() => undefined).mapErr(
          (e): PaymentError => ({ code: 'signature_invalid', message: e.message }),
        );
      }),

    parseWebhook: (account, req) =>
      ResultAsync.fromSafePromise(credsOf(account)).andThen((creds) => {
        const id = eventPaymentId(req.rawBody);
        if (creds === null || id === null) {
          return errAsync<readonly PaymentEvent[], PaymentError>({
            code: 'provider_error',
            message: 'Уведомление ЮKassa без object.id',
          });
        }
        // Состояние берём re-fetch'ем, а не из тела (телу не доверяем — оно неподписано).
        return deps.client.getPayment(creds, id).mapErr((e): PaymentError => ({ code: 'provider_error', message: e.message })).map(
          (payment): readonly PaymentEvent[] => {
            const outcome = STATUS_OUTCOME[payment.status];
            return outcome === null
              ? []
              : [
                  {
                    provider: YOOKASSA,
                    externalId: payment.id,
                    paymentId: null,
                    outcome,
                    amountMinor: payment.amountMinor,
                    occurredAt: new Date().toISOString(),
                  },
                ];
          },
        );
      }),
  };
};
