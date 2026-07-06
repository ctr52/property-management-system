import type { PriceOverride } from '../domain/types';

export type PriceOverrideRepo = {
  readonly listByProperty: (orgId: string, propertyId: string) => Promise<PriceOverride[]>;
  /** Оверрайды организации в диапазоне дат [from, to] — для bulk-расчёта календаря. */
  readonly listForOrgRange: (orgId: string, from: string, to: string) => Promise<PriceOverride[]>;
  /** Upsert по (orgId, propertyId, date). */
  readonly set: (override: PriceOverride) => Promise<void>;
  readonly remove: (orgId: string, propertyId: string, date: string) => Promise<void>;
};
