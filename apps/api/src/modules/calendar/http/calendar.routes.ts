import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CalendarQuerySchema, type CalendarView } from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type CalendarRouteDeps = {
  readonly getCalendar: (orgId: string, from: string, to: string) => Promise<Result<CalendarView, AppError>>;
};

export const createCalendarRoutes = (deps: CalendarRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/', requirePermission('calendar:read'), zValidator('query', CalendarQuerySchema), async (c) => {
    const { from, to } = c.req.valid('query');
    const result = await deps.getCalendar(c.get('auth').orgId, from, to);
    if (result.isErr()) {
      return c.json({ error: result.error }, httpStatusForError(result.error));
    }
    return c.json(result.value);
  });
