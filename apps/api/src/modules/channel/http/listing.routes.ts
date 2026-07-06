import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  AttachListingInputSchema,
  CreateListingInputSchema,
  type AttachListingInput,
  type CreateListingInput,
  type ListingLinkView,
} from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type ListingRouteDeps = {
  readonly createManaged: (orgId: string, input: CreateListingInput) => Promise<Result<ListingLinkView, AppError>>;
  readonly attach: (orgId: string, input: AttachListingInput) => Promise<Result<ListingLinkView, AppError>>;
  readonly listForProperty: (orgId: string, propertyId: string) => Promise<ListingLinkView[]>;
  readonly remove: (orgId: string, id: string) => Promise<Result<{ removed: true }, AppError>>;
};

export const createListingRoutes = (deps: ListingRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/property/:propertyId', requirePermission('listing:read'), async (c) => {
      return c.json(await deps.listForProperty(c.get('auth').orgId, c.req.param('propertyId')));
    })
    .post('/', requirePermission('listing:write'), zValidator('json', CreateListingInputSchema), async (c) => {
      const result = await deps.createManaged(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value, 201);
    })
    .post('/attach', requirePermission('listing:write'), zValidator('json', AttachListingInputSchema), async (c) => {
      const result = await deps.attach(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value, 201);
    })
    .post('/:id/remove', requirePermission('listing:write'), async (c) => {
      const result = await deps.remove(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value);
    });
