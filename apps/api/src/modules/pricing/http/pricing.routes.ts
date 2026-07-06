import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CreatePriceRuleInputSchema,
  RemovePriceOverrideInputSchema,
  SetPriceOverrideInputSchema,
  StayQuoteQuerySchema,
  type CreatePriceRuleInput,
  type PriceOverrideView,
  type PriceRuleView,
  type PropertyPricing,
  type SetPriceOverrideInput,
  type StayQuote,
  type StayQuoteQuery,
} from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';

export type PricingRouteDeps = {
  readonly getPropertyPricing: (orgId: string, propertyId: string) => Promise<PropertyPricing>;
  readonly createRule: (orgId: string, input: CreatePriceRuleInput) => Promise<Result<PriceRuleView, AppError>>;
  readonly removeRule: (orgId: string, id: string) => Promise<Result<{ removed: true }, AppError>>;
  readonly setOverride: (orgId: string, input: SetPriceOverrideInput) => Promise<Result<PriceOverrideView, AppError>>;
  readonly removeOverride: (
    orgId: string,
    propertyId: string,
    date: string,
  ) => Promise<Result<{ removed: true }, AppError>>;
  readonly quote: (orgId: string, input: StayQuoteQuery) => Promise<Result<StayQuote, AppError>>;
};

export const createPricingRoutes = (deps: PricingRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/property/:propertyId', requirePermission('property:read'), async (c) => {
      return c.json(await deps.getPropertyPricing(c.get('auth').orgId, c.req.param('propertyId')));
    })
    .get('/quote', requirePermission('property:read'), zValidator('query', StayQuoteQuerySchema), async (c) => {
      const result = await deps.quote(c.get('auth').orgId, c.req.valid('query'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .post('/rules', requirePermission('property:write'), zValidator('json', CreatePriceRuleInputSchema), async (c) => {
      const result = await deps.createRule(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value, 201);
    })
    .post('/rules/:id/remove', requirePermission('property:write'), async (c) => {
      const result = await deps.removeRule(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .post('/overrides', requirePermission('property:write'), zValidator('json', SetPriceOverrideInputSchema), async (c) => {
      const result = await deps.setOverride(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .post(
      '/overrides/remove',
      requirePermission('property:write'),
      zValidator('json', RemovePriceOverrideInputSchema),
      async (c) => {
        const { propertyId, date } = c.req.valid('json');
        const result = await deps.removeOverride(c.get('auth').orgId, propertyId, date);
        if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
        return c.json(result.value);
      },
    );
