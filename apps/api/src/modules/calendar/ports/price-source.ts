/** Резолвер цены за ночь: (объект, базовая цена, дата) → minor units. */
export type NightlyPriceResolver = (propertyId: string, baseMinor: number, date: string) => number;

/**
 * Источник цены за ночь для календаря — реализуется в composition root поверх модуля Pricing.
 * Calendar не зависит от Pricing напрямую: получает готовый резолвер на диапазон (bulk внутри).
 */
export type CalendarPriceSource = {
  readonly resolverForRange: (orgId: string, from: string, to: string) => Promise<NightlyPriceResolver>;
};
