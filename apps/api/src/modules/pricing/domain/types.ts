import type { PriceAdjustment, PriceCondition, PricePredicate } from '@pms/shared';

export type { PriceAdjustment, PriceCondition, PricePredicate };

/** Правило ценообразования (хранимое). match — generic-предикат над фактами даты/брони. */
export type PriceRule = {
  readonly id: string;
  readonly orgId: string;
  readonly propertyId: string;
  readonly label: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly match: PricePredicate;
  readonly adjustment: PriceAdjustment;
};

/** Ручная цена на конкретную дату (хранимая). */
export type PriceOverride = {
  readonly orgId: string;
  readonly propertyId: string;
  readonly date: string; // YYYY-MM-DD
  readonly amountMinor: number;
};
