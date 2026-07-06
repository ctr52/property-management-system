import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateBlockInputSchema, type CreateBlockInput } from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';
import type { AvailabilityHold } from '../domain/types';

export type AvailabilityRouteDeps = {
  readonly createBlock: (orgId: string, input: CreateBlockInput) => Promise<Result<AvailabilityHold, AppError>>;
  readonly removeBlock: (orgId: string, id: string) => Promise<Result<{ removed: true }, AppError>>;
};

/** Управление доступностью: ручные блокировки дат (право property:write). */
export const createAvailabilityRoutes = (deps: AvailabilityRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .post('/blocks', requirePermission('property:write'), zValidator('json', CreateBlockInputSchema), async (c) => {
      const result = await deps.createBlock(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value, 201);
    })
    .post('/blocks/:id/remove', requirePermission('property:write'), async (c) => {
      const result = await deps.removeBlock(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value);
    });
