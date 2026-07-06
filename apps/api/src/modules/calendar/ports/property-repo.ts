import type { Property } from '@pms/shared';

/** Минимальный порт чтения объектов для календаря. */
export type CalendarPropertyRepo = {
  readonly list: (orgId: string) => Promise<Property[]>;
};
