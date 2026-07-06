import { ResultAsync } from 'neverthrow';
import type { ChannelError } from '../../domain/types';

/** Строка отчёта Cian `/v1/get-order` (UnloadReportResponse.offers[]). */
export type CianOrderOffer = {
  readonly externalId: string;
  readonly offerId?: number;
  readonly status: string; // Published | Refused | RemovedByModerator | Blocked | Draft | ...
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
  readonly url?: string;
};

const transportError = (message: string): ChannelError => ({ kind: 'transport', message });

/**
 * GET /v1/get-order — отчёт по импорту фида: по каждому объекту статус, ошибки/предупреждения,
 * маппинг externalId → offerId. Ответ обёрнут в `{ operationId, result: { offers } }`.
 * Авторизация: `Authorization: Bearer <ACCESS KEY>`.
 */
export const cianGetOrder = (
  apiBase: string,
  accessKey: string,
): ResultAsync<CianOrderOffer[], ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${apiBase}/v1/get-order`, {
        headers: { Authorization: `Bearer ${accessKey}` },
      });
      if (!res.ok) {
        throw new Error(`get-order HTTP ${res.status}`);
      }
      const body = (await res.json()) as { result?: { offers?: CianOrderOffer[] } };
      return body.result?.offers ?? [];
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Cian get-order failed'),
  );

/**
 * POST /v3/register-notifications — регистрация push-вебхуков на наш URL (типы событий: чаты).
 * Форма ПРЕДПОЛАГАЕМАЯ (сверить с боевыми доками v3). Идемпотентна по url.
 */
export const cianSubscribeWebhooks = (
  apiBase: string,
  accessKey: string,
  webhookUrl: string,
): ResultAsync<void, ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${apiBase}/v3/register-notifications`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, eventTypes: ['newChatMessage'] }),
      });
      if (!res.ok) {
        throw new Error(`register-notifications HTTP ${res.status}`);
      }
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Cian register-notifications failed'),
  );

/** POST /v3/delete-notifications — снятие push-вебхуков по url. */
export const cianUnsubscribeWebhooks = (
  apiBase: string,
  accessKey: string,
  webhookUrl: string,
): ResultAsync<void, ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${apiBase}/v3/delete-notifications`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
      if (!res.ok) {
        throw new Error(`delete-notifications HTTP ${res.status}`);
      }
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Cian delete-notifications failed'),
  );

/** POST /v1/send-message — текст в чат от имени автора объявления (chatId — int64). */
export const cianSendMessage = (
  apiBase: string,
  accessKey: string,
  chatId: string,
  text: string,
): ResultAsync<void, ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${apiBase}/v1/send-message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: Number(chatId), content: { text } }),
      });
      if (!res.ok) {
        throw new Error(`send-message HTTP ${res.status}`);
      }
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Cian send-message failed'),
  );
