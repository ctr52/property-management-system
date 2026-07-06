import type { Property } from '@pms/shared';
import type { PropertyRepo } from '../ports/property-repo';

/**
 * In-memory адаптер порта PropertyRepo — для скаффолда/тестов.
 * Позже заменим на Postgres-адаптер, не трогая домен и use-cases.
 */
export const createInMemoryPropertyRepo = (seed: readonly Property[] = []): PropertyRepo => {
  const store = new Map<string, Property>(seed.map((property) => [property.id, property]));

  return {
    list: async (orgId) =>
      [...store.values()].filter((property) => property.orgId === orgId),
    getById: async (orgId, id) => {
      const property = store.get(id);
      return property && property.orgId === orgId ? property : null;
    },
    save: async (property) => {
      store.set(property.id, property);
    },
  };
};
