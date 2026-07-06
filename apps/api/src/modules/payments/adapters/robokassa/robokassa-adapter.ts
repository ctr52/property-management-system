import { createHash } from 'node:crypto';
import { ResultAsync, err, ok, type Result } from 'neverthrow';
import type { ProviderManifest } from '@pms/shared';
import type { PaymentError, PaymentEvent } from '../../domain/types';
import type { PaymentAccount, PaymentProviderAdapter, RawWebhookRequest } from '../../ports/provider';

/**
 * Robokassa (first-party). Нюансы интеграции, которые живут здесь:
 *  - редирект на Merchant/Index.aspx с подписью MD5(MerchantLogin:OutSum:InvId:Password1[:Shp_*]);
 *  - InvId — ЦЕЛОЕ; наш paymentId — UUID. Детерминированно выводим InvId из paymentId и отдаём его
 *    как externalId (init-payment сохранит → вебхук резолвится по нему);
 *  - accountId прокидываем через кастомный Shp_acc (Robokassa возвращает Shp_* в ResultURL и
 *    включает в подпись) — так вебхук знает, на какой аккаунт пришёл;
 *  - ResultURL подписан Password2; ответ боевой Robokassa ждёт тело `OK{InvId}` (в песочнице
 *    эмулятор довольствуется 200 — отметка для прода).
 *  - OutSum — в РУБЛЯХ (minor/100, 2 знака), не в копейках.
 */
export const ROBOKASSA = 'robokassa';

const manifest: ProviderManifest = {
  id: ROBOKASSA,
  title: 'Robokassa',
  kind: 'first-party',
  capabilities: { refunds: false, recurring: false, receipts: true, ingest: 'push' },
  connectSchema: [
    { key: 'merchantLogin', label: 'MerchantLogin (идентификатор магазина)', secret: false, required: true, kind: 'text' },
    { key: 'password1', label: 'Пароль #1', secret: true, required: true, kind: 'text' },
    { key: 'password2', label: 'Пароль #2', secret: true, required: true, kind: 'text' },
  ],
};

type Deps = {
  /** База редиректа: прод `https://auth.robokassa.ru`, дев — эмулятор. */
  readonly apiBase: string;
  readonly getSecret: (ref: string) => Promise<Record<string, string> | null>;
};

const md5 = (input: string): string => createHash('md5').update(input, 'utf8').digest('hex').toLowerCase();

/** Детерминированный положительный InvId из paymentId (стабилен при повторном init). */
const invIdFor = (paymentId: string): number =>
  (parseInt(createHash('sha256').update(paymentId).digest('hex').slice(0, 8), 16) % 2_000_000_000) + 1;

const asyncResult = <T>(p: Promise<Result<T, PaymentError>>): ResultAsync<T, PaymentError> =>
  ResultAsync.fromSafePromise(p).andThen((r) => r);

export const createRobokassaAdapter = (deps: Deps): PaymentProviderAdapter => {
  const secretsOf = async (account: PaymentAccount): Promise<Record<string, string> | null> =>
    account.credentialsRef ? deps.getSecret(account.credentialsRef) : null;

  return {
    provider: ROBOKASSA,
    manifest,
    capabilities: manifest.capabilities,

    initPayment: (account, intent) =>
      asyncResult(
        (async (): Promise<Result<{ kind: 'redirect'; url: string; externalId: string }, PaymentError>> => {
          const login = account.config.merchantLogin;
          if (!login) return err({ code: 'provider_error', message: 'merchantLogin не задан' });
          const secret = await secretsOf(account);
          if (!secret?.password1) return err({ code: 'provider_error', message: 'Password#1 недоступен' });

          const invId = invIdFor(intent.paymentId);
          const outSum = (intent.amountMinor / 100).toFixed(2);
          const accId = account.id;
          const signature = md5(`${login}:${outSum}:${invId}:${secret.password1}:Shp_acc=${accId}`);

          const url = new URL(`${deps.apiBase}/Merchant/Index.aspx`);
          url.searchParams.set('MerchantLogin', login);
          url.searchParams.set('OutSum', outSum);
          url.searchParams.set('InvId', String(invId));
          url.searchParams.set('Description', intent.description);
          url.searchParams.set('SignatureValue', signature);
          url.searchParams.set('Shp_acc', accId);
          url.searchParams.set('SuccessUrl', intent.returnUrl); // куда вернуть браузер после оплаты
          url.searchParams.set('Culture', 'ru');
          url.searchParams.set('Encoding', 'utf-8');

          return ok({ kind: 'redirect', url: url.toString(), externalId: String(invId) });
        })(),
      ),

    ingest: {
      // ResultURL приходит на наш публичный роут (неугадываемый accountId), а не через subscribe.
      mode: 'push',
      subscribe: async () => async () => {},
    },

    // ResultURL — form-urlencoded: OutSum, InvId, SignatureValue=MD5(OutSum:InvId:Password2[:Shp_*]).
    verifyWebhook: (account, req) =>
      asyncResult(
        (async (): Promise<Result<void, PaymentError>> => {
          const secret = await secretsOf(account);
          if (!secret?.password2) return err({ code: 'signature_invalid', message: 'Нет Password#2' });
          const p = new URLSearchParams(req.rawBody);
          const outSum = p.get('OutSum') ?? '';
          const invId = p.get('InvId') ?? '';
          const accId = p.get('Shp_acc') ?? '';
          const provided = (p.get('SignatureValue') ?? '').toLowerCase();
          const expected = md5(`${outSum}:${invId}:${secret.password2}:Shp_acc=${accId}`);
          return provided === expected
            ? ok(undefined)
            : err({ code: 'signature_invalid', message: 'Подпись ResultURL не совпала' });
        })(),
      ),

    parseWebhook: (_account, req) =>
      asyncResult(
        Promise.resolve(
          ((): Result<readonly PaymentEvent[], PaymentError> => {
            const p = new URLSearchParams(req.rawBody);
            const invId = p.get('InvId');
            const outSum = p.get('OutSum');
            if (!invId || !outSum) return err({ code: 'provider_error', message: 'ResultURL без InvId/OutSum' });
            // ResultURL Robokassa приходит только при успешной оплате.
            return ok([
              {
                provider: ROBOKASSA,
                externalId: invId,
                paymentId: null,
                outcome: 'succeeded',
                amountMinor: Math.round(Number(outSum) * 100),
                occurredAt: new Date().toISOString(),
              },
            ]);
          })(),
        ),
      ),
  };
};
