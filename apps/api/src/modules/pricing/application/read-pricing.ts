import type { PriceOverrideView, PriceRuleView, PropertyPricing } from '@pms/shared';
import { computeNightlyPrice } from '../domain/engine';
import type { PriceOverride, PriceRule } from '../domain/types';
import type { PriceRuleRepo } from '../ports/price-rule-repo';
import type { PriceOverrideRepo } from '../ports/price-override-repo';

export const toRuleView = (r: PriceRule): PriceRuleView => ({
  id: r.id,
  propertyId: r.propertyId,
  label: r.label,
  priority: r.priority,
  enabled: r.enabled,
  match: r.match,
  adjustment: r.adjustment,
});

export const toOverrideView = (o: PriceOverride): PriceOverrideView => ({
  propertyId: o.propertyId,
  date: o.date,
  amountMinor: o.amountMinor,
});

export type ReadPricingDeps = {
  readonly rules: PriceRuleRepo;
  readonly overrides: PriceOverrideRepo;
};

/** Прайсинг объекта целиком: правила + оверрайды (для экрана управления ценами). */
export const getPropertyPricing =
  (deps: ReadPricingDeps) =>
  async (orgId: string, propertyId: string): Promise<PropertyPricing> => {
    const [rules, overrides] = await Promise.all([
      deps.rules.listByProperty(orgId, propertyId),
      deps.overrides.listByProperty(orgId, propertyId),
    ]);
    return { rules: rules.map(toRuleView), overrides: overrides.map(toOverrideView) };
  };

/** Резолвер цены за ночь. */
export type NightlyResolver = (propertyId: string, baseMinor: number, date: string) => number;

/**
 * Готовит резолвер цены за ночь на диапазон (один bulk-load правил/оверрайдов).
 * platform не задаётся — это «наша» цена (для календаря). Канальный синк строит свой резолвер
 * с platform на тех же портах.
 */
export const buildNightlyResolver =
  (deps: ReadPricingDeps) =>
  async (orgId: string, from: string, to: string): Promise<NightlyResolver> => {
    const [rules, overrides] = await Promise.all([
      deps.rules.listByOrg(orgId),
      deps.overrides.listForOrgRange(orgId, from, to),
    ]);
    const overrideIndex = new Map(overrides.map((o) => [`${o.propertyId}:${o.date}`, o.amountMinor]));
    return (propertyId, baseMinor, date) => {
      const override = overrideIndex.get(`${propertyId}:${date}`) ?? null;
      const propertyRules = rules.filter((r) => r.propertyId === propertyId);
      return computeNightlyPrice(baseMinor, propertyRules, override, { date });
    };
  };
