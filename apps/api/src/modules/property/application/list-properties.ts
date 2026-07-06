import type { Property } from '@pms/shared';
import type { PropertyRepo } from '../ports/property-repo';

export type ListPropertiesDeps = {
  readonly repo: PropertyRepo;
};

/** Use-case: список объектов организации (tenant). */
export const listProperties =
  (deps: ListPropertiesDeps) =>
  (orgId: string): Promise<Property[]> =>
    deps.repo.list(orgId);
