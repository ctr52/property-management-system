import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreatePropertyInputSchema, UpdatePropertyInputSchema } from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import { httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';
import { listProperties, type ListPropertiesDeps } from '../application/list-properties';
import { createProperty, type CreatePropertyDeps } from '../application/create-property';
import { updateProperty, type UpdatePropertyDeps } from '../application/update-property';

export type PropertyRouteDeps = ListPropertiesDeps & CreatePropertyDeps & UpdatePropertyDeps;

/**
 * Тонкий HTTP-слой: tenant (orgId) берём из сессии (requireAuth кладёт auth в контекст),
 * валидируем zod-ом, зовём use-case, маппим Result в HTTP.
 */
export const createPropertyRoutes = (deps: PropertyRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) => {
  const list = listProperties(deps);
  const create = createProperty(deps);
  const update = updateProperty(deps);

  return new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/', requirePermission('property:read'), async (c) => {
      return c.json(await list(c.get('auth').orgId));
    })
    .get('/:id', requirePermission('property:read'), async (c) => {
      const property = await deps.repo.getById(c.get('auth').orgId, c.req.param('id'));
      if (!property) {
        return c.json({ error: { kind: 'not_found' as const, message: 'Объект не найден' } }, 404);
      }
      return c.json(property);
    })
    .post('/', requirePermission('property:write'), zValidator('json', CreatePropertyInputSchema), async (c) => {
      const result = await create(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value, 201);
    })
    .patch('/:id', requirePermission('property:write'), zValidator('json', UpdatePropertyInputSchema), async (c) => {
      const result = await update(c.get('auth').orgId, c.req.param('id'), c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value);
    });
};
