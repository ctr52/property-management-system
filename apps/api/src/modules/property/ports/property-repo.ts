import type { Property } from '@pms/shared';

/**
 * Порт хранилища объектов. Домен зависит от этого интерфейса,
 * а не от конкретной БД. Реализации — в adapters/.
 */
export type PropertyRepo = {
  readonly list: (orgId: string) => Promise<Property[]>;
  readonly getById: (orgId: string, id: string) => Promise<Property | null>;
  readonly save: (property: Property) => Promise<void>;
};
