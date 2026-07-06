import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateReservationInputSchema, type CreateReservationInput, type ReservationView } from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type ReservationRouteDeps = {
  readonly createReservation: (orgId: string, input: CreateReservationInput) => Promise<Result<ReservationView, AppError>>;
  readonly cancelReservation: (orgId: string, id: string) => Promise<Result<ReservationView, AppError>>;
  readonly listForProperty: (orgId: string, propertyId: string) => Promise<ReservationView[]>;
};

export const createReservationRoutes = (deps: ReservationRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/property/:propertyId', requirePermission('property:read'), async (c) => {
      return c.json(await deps.listForProperty(c.get('auth').orgId, c.req.param('propertyId')));
    })
    .post('/', requirePermission('property:write'), zValidator('json', CreateReservationInputSchema), async (c) => {
      const result = await deps.createReservation(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value, 201);
    })
    .post('/:id/cancel', requirePermission('property:write'), async (c) => {
      const result = await deps.cancelReservation(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value);
    });
