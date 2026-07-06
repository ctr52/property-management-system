import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  AssignCleaningInputSchema,
  CreateCleaningInputSchema,
  type CleanerView,
  type CleaningTaskView,
  type CreateCleaningInput,
} from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type CleaningRouteDeps = {
  readonly listBoard: (orgId: string) => Promise<CleaningTaskView[]>;
  readonly listMine: (orgId: string, userId: string) => Promise<CleaningTaskView[]>;
  readonly listCleaners: (orgId: string) => Promise<CleanerView[]>;
  readonly create: (orgId: string, input: CreateCleaningInput) => Promise<Result<CleaningTaskView, AppError>>;
  readonly assign: (orgId: string, id: string, assigneeId: string) => Promise<Result<CleaningTaskView, AppError>>;
  readonly start: (orgId: string, actorId: string, id: string) => Promise<Result<CleaningTaskView, AppError>>;
  readonly complete: (orgId: string, actorId: string, id: string) => Promise<Result<CleaningTaskView, AppError>>;
};

export const createCleaningRoutes = (deps: CleaningRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/', requirePermission('cleaning:read'), async (c) => c.json(await deps.listBoard(c.get('auth').orgId)))
    .get('/mine', requirePermission('cleaning:work'), async (c) =>
      c.json(await deps.listMine(c.get('auth').orgId, c.get('auth').userId)),
    )
    .get('/cleaners', requirePermission('cleaning:assign'), async (c) =>
      c.json(await deps.listCleaners(c.get('auth').orgId)),
    )
    .post('/', requirePermission('cleaning:assign'), zValidator('json', CreateCleaningInputSchema), async (c) => {
      const result = await deps.create(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value, 201);
    })
    .post('/:id/assign', requirePermission('cleaning:assign'), zValidator('json', AssignCleaningInputSchema), async (c) => {
      const result = await deps.assign(c.get('auth').orgId, c.req.param('id'), c.req.valid('json').assigneeId);
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .post('/:id/start', requirePermission('cleaning:work'), async (c) => {
      const result = await deps.start(c.get('auth').orgId, c.get('auth').userId, c.req.param('id'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .post('/:id/complete', requirePermission('cleaning:work'), async (c) => {
      const result = await deps.complete(c.get('auth').orgId, c.get('auth').userId, c.req.param('id'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    });
