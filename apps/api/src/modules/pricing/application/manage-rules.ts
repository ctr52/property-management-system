import { err, ok, type Result } from 'neverthrow';
import type { CreatePriceRuleInput, PriceRuleView } from '@pms/shared';
import { type AppError, notFoundError } from '../../../shared/errors';
import type { IdGen } from '../../../shared/ports';
import type { PriceRule } from '../domain/types';
import type { PriceRuleRepo } from '../ports/price-rule-repo';
import { toRuleView } from './read-pricing';

export type ManageRulesDeps = {
  readonly rules: PriceRuleRepo;
  readonly idGen: IdGen;
};

/** Создать правило ценообразования. Вход уже провалидирован zod на роуте. */
export const createPriceRule =
  (deps: ManageRulesDeps) =>
  async (orgId: string, input: CreatePriceRuleInput): Promise<Result<PriceRuleView, AppError>> => {
    const rule: PriceRule = {
      id: deps.idGen(),
      orgId,
      propertyId: input.propertyId,
      label: input.label,
      priority: input.priority,
      enabled: input.enabled,
      match: input.match,
      adjustment: input.adjustment,
    };
    await deps.rules.save(rule);
    return ok(toRuleView(rule));
  };

export const removePriceRule =
  (deps: ManageRulesDeps) =>
  async (orgId: string, id: string): Promise<Result<{ removed: true }, AppError>> => {
    const existing = await deps.rules.getById(orgId, id);
    if (!existing) return err(notFoundError('Правило не найдено'));
    await deps.rules.remove(orgId, id);
    return ok({ removed: true });
  };
