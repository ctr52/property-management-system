import type { PriceRule } from '../domain/types';

export type PriceRuleRepo = {
  readonly listByProperty: (orgId: string, propertyId: string) => Promise<PriceRule[]>;
  /** Все правила организации — для bulk-расчёта календаря (правил немного). */
  readonly listByOrg: (orgId: string) => Promise<PriceRule[]>;
  readonly getById: (orgId: string, id: string) => Promise<PriceRule | null>;
  readonly save: (rule: PriceRule) => Promise<void>;
  readonly remove: (orgId: string, id: string) => Promise<void>;
};
