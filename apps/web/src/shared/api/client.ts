import { hc } from 'hono/client';
import type { AppType } from '@pms/api/rpc';

/**
 * Типобезопасный клиент к бэкенду (Hono RPC).
 * Типы маршрутов берутся прямо из API — без дублирования контрактов.
 */
export const api = hc<AppType>('/api', {
  // Слать httpOnly session-cookie с каждым запросом.
  init: { credentials: 'include' },
});
