import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../../app-env';
import type { AuthContext } from '../domain/types';
import { readSessionToken } from './session-cookie';

export type Authenticate = (rawToken: string | null) => Promise<AuthContext | null>;

/** Middleware: пускает только при валидной сессии, кладёт auth в контекст. */
export const createRequireAuth = (authenticate: Authenticate): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const auth = await authenticate(readSessionToken(c));
    if (!auth) {
      return c.json({ error: { kind: 'unauthorized', message: 'Требуется вход' } }, 401);
    }
    c.set('auth', auth);
    await next();
  };
};
