import type { MiddlewareHandler } from 'hono';
import { can, type Permission } from '@pms/shared';
import type { AppEnv } from './app-env';

/**
 * Guard прав. Запускается после requireAuth (auth уже в контексте).
 * Кросс-срезовый: одна и та же модель прав (`can`), что и на фронте.
 */
export const requirePermission = (permission: Permission): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    if (!can(c.get('auth').role, permission)) {
      return c.json({ error: { kind: 'forbidden', message: 'Недостаточно прав' } }, 403);
    }
    await next();
  };
};
