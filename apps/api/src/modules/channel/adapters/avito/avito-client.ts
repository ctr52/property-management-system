import { ResultAsync } from 'neverthrow';
import type { ChannelError } from '../../domain/types';

const transportError = (message: string): ChannelError => ({ kind: 'transport', message });

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

/**
 * OAuth2 client_credentials → access_token (POST {base}/token, form-encoded).
 * Кэшируем по clientId до истечения.
 */
export const avitoGetToken = (
  apiBase: string,
  clientId: string,
  clientSecret: string,
): ResultAsync<string, ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const cached = tokenCache.get(clientId);
      if (cached && cached.expiresAt > Date.now() + 5_000) return cached.token;

      const res = await fetch(`${apiBase}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      if (!res.ok) throw new Error(`token HTTP ${res.status}`);
      const body = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!body.access_token) throw new Error('Avito token: нет access_token');

      tokenCache.set(clientId, {
        token: body.access_token,
        expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      });
      return body.access_token;
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Avito token failed'),
  );

/** POST /messenger/v1/accounts/{user_id}/chats/{chat_id}/messages — текстовое сообщение. */
export const avitoSendMessage = (
  apiBase: string,
  token: string,
  userId: string,
  chatId: string,
  text: string,
): ResultAsync<void, ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${apiBase}/messenger/v1/accounts/${userId}/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: { text }, type: 'text' }),
      });
      if (!res.ok) {
        throw new Error(`send HTTP ${res.status}`);
      }
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Avito send failed'),
  );

export type AvitoOccupiedInterval = { readonly date_start: string; readonly date_end: string };

/** POST /core/v1/accounts/{user_id}/items/{item_id}/bookings — календарь занятости (закрытые даты). */
export const avitoPostAvailability = (
  apiBase: string,
  token: string,
  userId: string,
  itemId: string,
  occupied: readonly AvitoOccupiedInterval[],
): ResultAsync<void, ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${apiBase}/core/v1/accounts/${userId}/items/${itemId}/bookings`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ bookings: occupied, source: 'pms' }),
      });
      if (!res.ok) {
        throw new Error(`availability HTTP ${res.status}`);
      }
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Avito availability failed'),
  );

export type AvitoPriceRange = { readonly date_from: string; readonly date_to: string; readonly night_price: number };

/** POST /realty/v1/accounts/{user_id}/items/{item_id}/prices — цены по диапазонам дат. */
export const avitoPostPrices = (
  apiBase: string,
  token: string,
  userId: string,
  itemId: string,
  prices: readonly AvitoPriceRange[],
): ResultAsync<void, ChannelError> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${apiBase}/realty/v1/accounts/${userId}/items/${itemId}/prices`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ prices }),
      });
      if (!res.ok) throw new Error(`prices HTTP ${res.status}`);
    })(),
    (error) => transportError(error instanceof Error ? error.message : 'Avito prices failed'),
  );
