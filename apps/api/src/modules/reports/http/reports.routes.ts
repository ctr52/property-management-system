import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ReportQuerySchema, type Report, type ReportQuery } from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type ReportsRouteDeps = {
  readonly getReport: (orgId: string, query: ReportQuery) => Promise<Result<Report, AppError>>;
};

export const createReportsRoutes = (deps: ReportsRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/', requirePermission('report:read'), zValidator('query', ReportQuerySchema), async (c) => {
      const result = await deps.getReport(c.get('auth').orgId, c.req.valid('query'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    });
