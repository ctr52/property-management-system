import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CommissionReportQuerySchema,
  SetCommissionRuleInputSchema,
  type CommissionReport,
  type CommissionReportQuery,
  type CommissionRule,
  type SetCommissionRuleInput,
} from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type CommissionsRouteDeps = {
  readonly listRules: (orgId: string) => Promise<CommissionRule[]>;
  readonly setRule: (orgId: string, input: SetCommissionRuleInput) => Promise<Result<CommissionRule, AppError>>;
  readonly getReport: (orgId: string, query: CommissionReportQuery) => Promise<Result<CommissionReport, AppError>>;
};

export const createCommissionsRoutes = (deps: CommissionsRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/rules', requirePermission('commission:read'), async (c) =>
      c.json(await deps.listRules(c.get('auth').orgId)),
    )
    .post('/rules', requirePermission('commission:manage'), zValidator('json', SetCommissionRuleInputSchema), async (c) => {
      const result = await deps.setRule(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .get('/report', requirePermission('commission:read'), zValidator('query', CommissionReportQuerySchema), async (c) => {
      const result = await deps.getReport(c.get('auth').orgId, c.req.valid('query'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    });
