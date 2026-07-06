import { Hono } from 'hono';
import type { GuestView } from '@pms/shared';

/**
 * ПУБЛИЧНЫЕ роуты гостевого портала (без авторизации). Защита — неугадываемый token в URL.
 * Гость ходит только на наш бэкенд; на провайдера его уводит redirectUrl.
 */
export type GuestRouteDeps = {
  readonly getGuestView: (token: string) => Promise<GuestView | null>;
  readonly payGuest: (token: string, legId: string) => Promise<{ redirectUrl: string } | null>;
};

export const createPublicGuestRoutes = (deps: GuestRouteDeps) =>
  new Hono()
    .get('/guest/:token', async (c) => {
      const view = await deps.getGuestView(c.req.param('token'));
      if (!view) return c.json({ error: { kind: 'not_found', message: 'Бронь не найдена' } }, 404);
      return c.json(view);
    })
    .post('/guest/:token/pay/:legId', async (c) => {
      const result = await deps.payGuest(c.req.param('token'), c.req.param('legId'));
      if (!result) return c.json({ error: { kind: 'validation', message: 'Оплата недоступна' } }, 400);
      return c.json(result);
    });
