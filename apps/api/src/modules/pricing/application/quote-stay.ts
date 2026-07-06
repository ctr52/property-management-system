import { err, ok, type Result } from 'neverthrow';
import type { StayQuote, StayQuoteQuery } from '@pms/shared';
import { type AppError, notFoundError } from '../../../shared/errors';
import type { Clock } from '../../../shared/ports';
import { quoteStay } from '../domain/engine';
import type { PriceOverrideRepo } from '../ports/price-override-repo';
import type { PriceRuleRepo } from '../ports/price-rule-repo';

/** Источник базовой цены/валюты объекта — реализуется в composition root (Pricing не знает Property). */
export type PricingPropertySource = {
  readonly get: (orgId: string, propertyId: string) => Promise<{ basePriceMinor: number; currency: string } | null>;
};

export type QuoteStayDeps = {
  readonly rules: PriceRuleRepo;
  readonly overrides: PriceOverrideRepo;
  readonly properties: PricingPropertySource;
  readonly clock: Clock;
};

/** Рассчитать цену проживания по DSL (база + правила + оверрайды, факты LOS/lead-time). */
export const getStayQuote =
  (deps: QuoteStayDeps) =>
  async (orgId: string, input: StayQuoteQuery): Promise<Result<StayQuote, AppError>> => {
    const property = await deps.properties.get(orgId, input.propertyId);
    if (!property) return err(notFoundError('Объект не найден'));

    const [rules, overrides] = await Promise.all([
      deps.rules.listByProperty(orgId, input.propertyId),
      deps.overrides.listByProperty(orgId, input.propertyId),
    ]);
    const overrideIndex = new Map(overrides.map((o) => [o.date, o.amountMinor]));
    const today = deps.clock.now().toISOString().slice(0, 10);

    const result = quoteStay(
      property.basePriceMinor,
      rules,
      (date) => overrideIndex.get(date) ?? null,
      input.checkIn,
      input.checkOut,
      today,
    );
    return ok({
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: result.nights,
      totalMinor: result.totalMinor,
      currency: property.currency,
      perNight: result.perNight,
    });
  };
