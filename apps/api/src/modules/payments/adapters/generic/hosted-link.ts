import { ResultAsync, err, ok, type Result } from 'neverthrow';
import type { ConnectFieldSpec, ProviderManifest } from '@pms/shared';
import type { PaymentError, PaymentEvent } from '../../domain/types';
import type { PaymentAccount, PaymentProviderAdapter } from '../../ports/provider';
import { isPublicHttpsUrl } from './ssrf';
import { DEFAULT_INBOUND_JSONATA, DEFAULT_OUTBOUND_JSONATA, createTransform } from './transform';

/**
 * Generic-провайдер «hosted payment link»: один адаптер на множество ПС. Маппинг вход/выход —
 * через шаблоны JSONata аккаунта (см. transform.ts), включая подпись. Адаптер без хардкода контракта.
 */
export const GENERIC_HOSTED_LINK = 'generic-hosted-link';

const template = (key: string, label: string, hint: string): ConnectFieldSpec => ({
  key,
  label,
  secret: false,
  required: false,
  kind: 'textarea',
  advanced: true,
  hint,
});

const manifest: ProviderManifest = {
  id: GENERIC_HOSTED_LINK,
  title: 'Платёжная ссылка (универсальный)',
  kind: 'generic-hosted-link',
  capabilities: { refunds: false, recurring: false, receipts: false, ingest: 'push' },
  connectSchema: [
    { key: 'displayName', label: 'Название платёжной системы', secret: false, required: true, kind: 'text' },
    { key: 'endpointUrl', label: 'URL страницы оплаты (https)', secret: false, required: true, kind: 'url' },
    { key: 'secretKey', label: 'Секретный ключ подписи', secret: true, required: true, kind: 'text' },
    template(
      'inboundTemplate',
      'Шаблон вебхука (JSONata) → { signatureValid, paymentId, externalId, outcome, amountMinor }',
      DEFAULT_INBOUND_JSONATA,
    ),
    template('outboundTemplate', 'Шаблон редиректа на оплату (JSONata) → URL-строка', DEFAULT_OUTBOUND_JSONATA),
  ],
};

type Deps = {
  readonly getSecret: (ref: string) => Promise<Record<string, string> | null>;
};

const asyncResult = <T>(p: Promise<Result<T, PaymentError>>): ResultAsync<T, PaymentError> =>
  ResultAsync.fromSafePromise(p).andThen((r) => r);

export const createGenericHostedLinkAdapter = (deps: Deps): PaymentProviderAdapter => {
  const secretOf = async (account: PaymentAccount): Promise<string | null> => {
    if (!account.credentialsRef) return null;
    const secret = await deps.getSecret(account.credentialsRef);
    return secret?.secretKey ?? null;
  };

  return {
    provider: GENERIC_HOSTED_LINK,
    manifest,
    capabilities: manifest.capabilities,

    initPayment: (account, intent) =>
      asyncResult(
        (async (): Promise<Result<{ kind: 'redirect'; url: string }, PaymentError>> => {
          const endpoint = account.config.endpointUrl;
          if (!endpoint || !isPublicHttpsUrl(endpoint)) {
            return err({ code: 'provider_error', message: 'URL страницы оплаты не задан или не публичный https' });
          }
          const secret = await secretOf(account);
          if (!secret) return err({ code: 'provider_error', message: 'Секрет провайдера недоступен' });
          try {
            const url = await createTransform(account.config, secret).outbound({
              paymentId: intent.paymentId,
              amountMinor: intent.amountMinor,
              currency: intent.currency,
              returnUrl: intent.returnUrl,
              endpointUrl: endpoint,
            });
            if (!url) return err({ code: 'provider_error', message: 'Шаблон редиректа вернул пустой URL' });
            return ok({ kind: 'redirect', url });
          } catch (error) {
            return err({ code: 'provider_error', message: error instanceof Error ? error.message : 'Ошибка шаблона редиректа' });
          }
        })(),
      ),

    ingest: { mode: 'push', subscribe: async () => async () => {} },

    verifyWebhook: (account, req) =>
      asyncResult(
        (async (): Promise<Result<void, PaymentError>> => {
          const secret = await secretOf(account);
          if (!secret) return err({ code: 'signature_invalid', message: 'Нет секрета' });
          try {
            const r = await createTransform(account.config, secret).inbound({ headers: req.headers, rawBody: req.rawBody });
            return r.signatureValid ? ok(undefined) : err({ code: 'signature_invalid', message: 'Подпись вебхука не совпала' });
          } catch (error) {
            return err({ code: 'provider_error', message: error instanceof Error ? error.message : 'Ошибка шаблона вебхука' });
          }
        })(),
      ),

    parseWebhook: (account, req) =>
      asyncResult(
        (async (): Promise<Result<readonly PaymentEvent[], PaymentError>> => {
          const secret = await secretOf(account);
          if (!secret) return err({ code: 'provider_error', message: 'Нет секрета' });
          try {
            const r = await createTransform(account.config, secret).inbound({ headers: req.headers, rawBody: req.rawBody });
            if (!r.outcome) return err({ code: 'provider_error', message: 'Неизвестный статус вебхука' });
            return ok([
              {
                provider: GENERIC_HOSTED_LINK,
                externalId: r.externalId,
                paymentId: r.paymentId,
                outcome: r.outcome,
                amountMinor: r.amountMinor,
                occurredAt: new Date().toISOString(),
              },
            ]);
          } catch (error) {
            return err({ code: 'provider_error', message: error instanceof Error ? error.message : 'Ошибка шаблона вебхука' });
          }
        })(),
      ),
  };
};
