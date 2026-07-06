import { ok, type Result } from 'neverthrow';
import type { PriceOverrideView, SetPriceOverrideInput } from '@pms/shared';
import type { AppError } from '../../../shared/errors';
import type { PriceOverride } from '../domain/types';
import type { PriceOverrideRepo } from '../ports/price-override-repo';
import { toOverrideView } from './read-pricing';

export type ManageOverridesDeps = {
  readonly overrides: PriceOverrideRepo;
};

/** Поставить ручную цену на дату (upsert). */
export const setPriceOverride =
  (deps: ManageOverridesDeps) =>
  async (orgId: string, input: SetPriceOverrideInput): Promise<Result<PriceOverrideView, AppError>> => {
    const override: PriceOverride = {
      orgId,
      propertyId: input.propertyId,
      date: input.date,
      amountMinor: input.amountMinor,
    };
    await deps.overrides.set(override);
    return ok(toOverrideView(override));
  };

export const removePriceOverride =
  (deps: ManageOverridesDeps) =>
  async (orgId: string, propertyId: string, date: string): Promise<Result<{ removed: true }, AppError>> => {
    await deps.overrides.remove(orgId, propertyId, date);
    return ok({ removed: true });
  };
