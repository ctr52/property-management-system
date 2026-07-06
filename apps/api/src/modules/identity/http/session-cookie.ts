import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';

export const SESSION_COOKIE = 'pms_session';

// Secure только в проде (на http://localhost Secure-cookie не сохранится).
// Читаем env через globalThis, чтобы файл оставался в RPC-графе фронта без node-типов.
const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.NODE_ENV;
const secure = nodeEnv === 'production';

export const setSessionCookie = (c: Context, token: string, expiresAt: Date): void => {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, // JS не читает — защита от XSS-кражи токена
    sameSite: 'Lax', // защита от CSRF на межсайтовых POST
    secure,
    path: '/',
    expires: expiresAt,
  });
};

export const clearSessionCookie = (c: Context): void => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
};

export const readSessionToken = (c: Context): string | null => getCookie(c, SESSION_COOKIE) ?? null;
