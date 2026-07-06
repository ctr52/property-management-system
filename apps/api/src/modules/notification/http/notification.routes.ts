import { Hono } from 'hono';
import type { NotificationFeed } from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type NotificationRouteDeps = {
  readonly feed: (orgId: string, userId: string) => Promise<NotificationFeed>;
  readonly markRead: (orgId: string, userId: string, id: string) => Promise<void>;
  readonly markAllRead: (orgId: string, userId: string) => Promise<void>;
};

export const createNotificationRoutes = (deps: NotificationRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/', requirePermission('notification:read'), async (c) =>
      c.json(await deps.feed(c.get('auth').orgId, c.get('auth').userId)),
    )
    .post('/:id/read', requirePermission('notification:read'), async (c) => {
      await deps.markRead(c.get('auth').orgId, c.get('auth').userId, c.req.param('id'));
      return c.json({ ok: true as const });
    })
    .post('/read-all', requirePermission('notification:read'), async (c) => {
      await deps.markAllRead(c.get('auth').orgId, c.get('auth').userId);
      return c.json({ ok: true as const });
    });
