import { err, type Result } from 'neverthrow';
import type { Property, UpdatePropertyInput } from '@pms/shared';
import { type AppError, notFoundError } from '../../../shared/errors';
import type { PropertyRepo } from '../ports/property-repo';
import { applyPropertyEdits } from '../domain/update-property';

export type UpdatePropertyDeps = {
  readonly repo: PropertyRepo;
  /**
   * Хук «контент объекта изменился» — нейтральный слушатель (channel-модуль пометит
   * листинги устаревшими). Опционален: property-модуль не знает, кто подписан.
   */
  readonly onContentChanged?: (orgId: string, propertyId: string) => Promise<void>;
};

/** Use-case: загрузить объект, применить правки, сохранить. */
export const updateProperty =
  (deps: UpdatePropertyDeps) =>
  async (orgId: string, id: string, patch: UpdatePropertyInput): Promise<Result<Property, AppError>> => {
    const existing = await deps.repo.getById(orgId, id);
    if (!existing) {
      return err(notFoundError('Объект не найден'));
    }

    const updated = applyPropertyEdits(existing, patch);
    if (updated.isErr()) {
      return updated;
    }

    await deps.repo.save(updated.value);

    // Поля, попадающие в листинг/фид. Уведомляем только при реальном изменении.
    const contentChanged =
      updated.value.title !== existing.title ||
      updated.value.basePriceMinor !== existing.basePriceMinor;
    if (contentChanged) {
      await deps.onContentChanged?.(orgId, id);
    }

    return updated;
  };
