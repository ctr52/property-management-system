import { createHmac } from 'node:crypto';
import { ResultAsync, err, ok, type Result } from 'neverthrow';
import type { ProviderManifest } from '@pms/shared';
import type { PaymentError, PaymentEvent } from '../../domain/types';
import type { PaymentAccount, PaymentProviderAdapter, RawWebhookRequest } from '../../ports/provider';

/**
 * Точка Банк (first-party, эквайринг). ВНИМАНИЕ: форма протокола ПРЕДПОЛАГАЕМАЯ — сверить
 * с боевой документацией. Контраст с Robokassa (показывает гибкость порта):
 *  - инициация — РЕАЛЬНЫЙ REST-вызов `POST /acquiring/v1.0/payments` с Bearer-токеном →
 *    ответ `{ Data: { operationId, paymentLink } }`; operationId сохраняем как externalId;
 *  - вебхук — JWT (а не form+MD5). В песочнице HS256 на том же apiToken (боевой Точки — RS256
 *    по публичному ключу банка; заменить verify здесь);
 *  - accountId прокидываем в теле создания (`Data.accountRef`), чтобы вебхук знал свой аккаунт
 *    (в проде webhook-URL настраивается в кабинете банка — это песочный мост).
 */
export const TOCHKA = 'tochka';

const manifest: ProviderManifest = {
  id: TOCHKA,
  title: 'Точка Банк',
  kind: 'first-party',
  capabilities: { refunds: true, recurring: false, receipts: true, ingest: 'push' },
  connectSchema: [
    { key: 'customerCode', label: 'Customer Code', secret: false, required: true, kind: 'text' },
    { key: 'apiToken', label: 'API-токен (Bearer)', secret: true, required: true, kind: 'text' },
  ],
};

type Deps = {
  /** База API: прод `https://enter.tochka.com/uapi`, дев — эмулятор. */
  readonly apiBase: string;
  readonly getSecret: (ref: string) => Promise<Record<string, string> | null>;
};

const STATUS_OUTCOME: Readonly<Record<string, PaymentEvent['outcome']>> = {
  APPROVED: 'succeeded',
  CONFIRMED: 'succeeded',
  REJECTED: 'failed',
  REFUNDED: 'refunded',
};

const b64urlDecode = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const asyncResult = <T>(p: Promise<Result<T, PaymentError>>): ResultAsync<T, PaymentError> =>
  ResultAsync.fromSafePromise(p).andThen((r) => r);

export const createTochkaAdapter = (deps: Deps): PaymentProviderAdapter => {
  const tokenOf = async (account: PaymentAccount): Promise<string | null> => {
    if (!account.credentialsRef) return null;
    const secret = await deps.getSecret(account.credentialsRef);
    return secret?.apiToken ?? null;
  };

  return {
    provider: TOCHKA,
    manifest,
    capabilities: manifest.capabilities,

    initPayment: (account, intent) =>
      asyncResult(
        (async (): Promise<Result<{ kind: 'redirect'; url: string; externalId: string }, PaymentError>> => {
          const apiToken = await tokenOf(account);
          if (!apiToken) return err({ code: 'provider_error', message: 'API-токен недоступен' });
          const customerCode = account.config.customerCode;
          if (!customerCode) return err({ code: 'provider_error', message: 'customerCode не задан' });

          try {
            const res = await fetch(`${deps.apiBase}/acquiring/v1.0/payments`, {
              method: 'POST',
              headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
              body: JSON.stringify({
                Data: {
                  customerCode,
                  accountRef: account.id, // песочный мост: вернётся в вебхуке как адрес аккаунта
                  amount: Number((intent.amountMinor / 100).toFixed(2)),
                  purpose: intent.description,
                  redirectUrl: intent.returnUrl,
                  paymentMode: ['sbp', 'card'],
                },
              }),
            });
            if (!res.ok) return err({ code: 'provider_error', message: `Точка вернула ${res.status}` });
            const json = (await res.json()) as { Data?: { operationId?: string; paymentLink?: string } };
            const operationId = json.Data?.operationId;
            const paymentLink = json.Data?.paymentLink;
            if (!operationId || !paymentLink) {
              return err({ code: 'provider_error', message: 'Нет operationId/paymentLink в ответе' });
            }
            return ok({ kind: 'redirect', url: paymentLink, externalId: operationId });
          } catch (error) {
            return err({ code: 'provider_error', message: error instanceof Error ? error.message : 'Сбой запроса к Точке' });
          }
        })(),
      ),

    ingest: { mode: 'push', subscribe: async () => async () => {} },

    // Вебхук Точки — JWT (compact) в теле. В песочнице HS256 на apiToken.
    verifyWebhook: (account, req) =>
      asyncResult(
        (async (): Promise<Result<void, PaymentError>> => {
          const apiToken = await tokenOf(account);
          if (!apiToken) return err({ code: 'signature_invalid', message: 'Нет apiToken' });
          const parts = req.rawBody.split('.');
          if (parts.length !== 3) return err({ code: 'signature_invalid', message: 'Не JWT' });
          const h = parts[0] ?? '';
          const p = parts[1] ?? '';
          const sig = parts[2] ?? '';
          const expected = b64url(createHmac('sha256', apiToken).update(`${h}.${p}`).digest());
          return sig === expected ? ok(undefined) : err({ code: 'signature_invalid', message: 'JWT-подпись не совпала' });
        })(),
      ),

    parseWebhook: (_account, req) =>
      asyncResult(
        Promise.resolve(
          ((): Result<readonly PaymentEvent[], PaymentError> => {
            const parts = req.rawBody.split('.');
            const payloadPart = parts[1];
            if (!payloadPart) return err({ code: 'provider_error', message: 'JWT без payload' });
            let claims: Record<string, unknown>;
            try {
              claims = JSON.parse(b64urlDecode(payloadPart).toString('utf8')) as Record<string, unknown>;
            } catch {
              return err({ code: 'provider_error', message: 'JWT payload не JSON' });
            }
            const operationId = String(claims.operationId ?? '');
            const outcome = STATUS_OUTCOME[String(claims.status ?? '')];
            if (!operationId || !outcome) {
              return err({ code: 'provider_error', message: 'Неполный/неизвестный статус вебхука' });
            }
            return ok([
              {
                provider: TOCHKA,
                externalId: operationId,
                paymentId: null,
                outcome,
                amountMinor: Math.round(Number(claims.amount ?? 0) * 100),
                occurredAt: new Date().toISOString(),
              },
            ]);
          })(),
        ),
      ),
  };
};
