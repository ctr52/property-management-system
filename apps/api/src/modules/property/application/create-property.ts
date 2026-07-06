import type { Result } from 'neverthrow';
import type { CreatePropertyInput, Property } from '@pms/shared';
import type { AppError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import type { PropertyRepo } from '../ports/property-repo';
import { makeProperty } from '../domain/create-property';

export type CreatePropertyDeps = {
  readonly repo: PropertyRepo;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

/**
 * Use-case: оркестрирует чистый домен + порты.
 * Сам остаётся тонким: собрал объект → сохранил → вернул Result.
 */
export const createProperty =
  (deps: CreatePropertyDeps) =>
  async (orgId: string, input: CreatePropertyInput): Promise<Result<Property, AppError>> => {
    const result = makeProperty(input, {
      id: deps.idGen(),
      orgId,
      now: deps.clock.now(),
    });

    if (result.isErr()) {
      return result;
    }

    await deps.repo.save(result.value);
    return result;
  };
