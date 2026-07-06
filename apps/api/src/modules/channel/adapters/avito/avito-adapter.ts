import { createHmac } from 'node:crypto';
import { err, errAsync, okAsync, ResultAsync } from 'neverthrow';
import { mappingError, notImplemented, type ChannelError } from '../../domain/types';
import type { ChannelAdapter } from '../../ports/adapter';
import {
  avitoGetToken,
  avitoPostAvailability,
  avitoPostPrices,
  avitoSendMessage,
  type AvitoOccupiedInterval,
} from './avito-client';
import { parseAvitoWebhook } from './avito-webhook';

export type AvitoCreds = { readonly clientId: string; readonly clientSecret: string; readonly userId: string };

export type AvitoAdapterDeps = {
  /** База API (прод `https://api.avito.ru`, дев — фейк `http://localhost:4000/avito`). */
  readonly apiBase: string;
  /** Достаёт OAuth-креды активного Avito-аккаунта организации из vault. */
  readonly resolveCreds: (orgId: string) => Promise<AvitoCreds | null>;
};

const authError = (message: string): ChannelError => ({ kind: 'auth', message });

const nextDay = (d: string): string =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/** Свести per-date обновления в закрытые интервалы (открытый конец) для календаря Avito. */
const toOccupiedIntervals = (
  updates: readonly { readonly date: string; readonly available: boolean }[],
): AvitoOccupiedInterval[] => {
  const sorted = [...updates].sort((a, b) => (a.date < b.date ? -1 : 1));
  const intervals: AvitoOccupiedInterval[] = [];
  let start: string | null = null;
  let last: string | null = null;
  for (const u of sorted) {
    if (!u.available) {
      start ??= u.date;
      last = u.date;
    } else if (start !== null && last !== null) {
      intervals.push({ date_start: start, date_end: nextDay(last) });
      start = null;
      last = null;
    }
  }
  if (start !== null && last !== null) {
    intervals.push({ date_start: start, date_end: nextDay(last) });
  }
  return intervals;
};

/**
 * Avito: фид (контент) + REST API (OAuth2 client_credentials). Реализованы цены по датам
 * (`POST /realty/v1/.../prices`) и приём сообщений (вебхук мессенджера). Календарь/брони/отправка
 * сообщений — следующим шагом.
 */
export const createAvitoAdapter = (deps: AvitoAdapterDeps): ChannelAdapter => ({
  platform: 'avito',
  capabilities: {
    listingPublish: 'feed',
    priceSync: 'per-date',
    availabilitySync: 'per-date',
    bookingIngest: 'poll',
    messaging: 'push',
    publishFeedback: 'webhook',
  },
  publisher: {
    buildFeed: () => err(notImplemented('Avito feed formatter ещё не реализован')),
  },
  priceSync: {
    pushPrices: (link, updates) => {
      if (!link.platformListingId) {
        return errAsync(mappingError('Avito: нет item_id (platformListingId) — привяжите объявление'));
      }
      const itemId = link.platformListingId;
      return ResultAsync.fromSafePromise(deps.resolveCreds(link.orgId)).andThen((creds) =>
        creds
          ? avitoGetToken(deps.apiBase, creds.clientId, creds.clientSecret).andThen((token) =>
              avitoPostPrices(
                deps.apiBase,
                token,
                creds.userId,
                itemId,
                updates.map((u) => ({
                  date_from: u.date,
                  date_to: u.date,
                  night_price: Math.round(u.amountMinor / 100),
                })),
              ),
            )
          : errAsync<void, ChannelError>(authError('Avito: нет подключённого аккаунта/кредов')),
      );
    },
  },
  availabilitySync: {
    pushAvailability: (link, updates) => {
      if (!link.platformListingId) {
        return errAsync(mappingError('Avito: нет item_id (platformListingId)'));
      }
      const itemId = link.platformListingId;
      const occupied = toOccupiedIntervals(updates);
      return ResultAsync.fromSafePromise(deps.resolveCreds(link.orgId)).andThen((creds) =>
        creds
          ? avitoGetToken(deps.apiBase, creds.clientId, creds.clientSecret).andThen((token) =>
              avitoPostAvailability(deps.apiBase, token, creds.userId, itemId, occupied),
            )
          : errAsync<void, ChannelError>(authError('Avito: нет подключённого аккаунта/кредов')),
      );
    },
  },
  bookings: {
    ingest: {
      mode: 'poll',
      intervalSec: 60,
      poll: () => errAsync(notImplemented('Avito getRealtyBookings ещё не реализован')),
    },
  },
  messaging: {
    ingest: {
      mode: 'push',
      // Подписка на вебхуки мессенджера (POST /messenger/v3/webhook) — реализация next.
      subscribe: async () => async () => {
        /* отписка-заглушка */
      },
    },
    send: (account, threadId, text) =>
      ResultAsync.fromSafePromise(deps.resolveCreds(account.orgId)).andThen((creds) =>
        creds
          ? avitoGetToken(deps.apiBase, creds.clientId, creds.clientSecret).andThen((token) =>
              avitoSendMessage(deps.apiBase, token, creds.userId, threadId, text),
            )
          : errAsync<void, ChannelError>(authError('Avito: нет подключённого аккаунта/кредов')),
      ),
  },
  webhook: {
    // Подпись Avito-мессенджера: HMAC-SHA256(тело, client_secret) в заголовке
    // x-avito-messenger-signature (форма ПРЕДПОЛАГАЕМАЯ — сверить с боевыми доками).
    verify: (account, req) =>
      ResultAsync.fromSafePromise(deps.resolveCreds(account.orgId)).andThen((creds) => {
        if (!creds) return errAsync<void, ChannelError>(authError('Avito: нет кредов для проверки подписи'));
        const provided = (req.headers['x-avito-messenger-signature'] ?? '').toLowerCase();
        const expected = createHmac('sha256', creds.clientSecret).update(req.rawBody, 'utf8').digest('hex').toLowerCase();
        return provided !== '' && provided === expected
          ? okAsync<void, ChannelError>(undefined)
          : errAsync<void, ChannelError>(authError('Avito: подпись вебхука не совпала'));
      }),
    parse: parseAvitoWebhook,
  },
  publishFeedback: {
    mode: 'webhook',
    parse: () => err(notImplemented('Avito publish-feedback reconcile ещё не реализован')),
  },
});
