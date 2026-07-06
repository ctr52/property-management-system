import { ok, err, type Result } from 'neverthrow';
import type { CreatePropertyInput, Property } from '@pms/shared';
import { type AppError, validationError } from '../../../shared/errors';

export type MakePropertyContext = {
  readonly id: string;
  readonly orgId: string;
  readonly now: Date;
};

/** Верхняя граница базовой цены: 1 000 000 ₽/ночь (в копейках). */
const MAX_BASE_PRICE_MINOR = 100_000_000;

/**
 * Чистая функция домена: из входа и контекста собирает валидный объект Property.
 * Никакого IO — только правила. Ошибки через Result.
 */
export const makeProperty = (
  input: CreatePropertyInput,
  ctx: MakePropertyContext,
): Result<Property, AppError> => {
  const title = input.title.trim();
  const address = input.address.trim();

  if (title.length === 0) {
    return err(validationError('Название не может быть пустым'));
  }
  if (input.basePriceMinor > MAX_BASE_PRICE_MINOR) {
    return err(validationError('Базовая цена слишком большая'));
  }

  return ok({
    id: ctx.id,
    orgId: ctx.orgId,
    title,
    address,
    basePriceMinor: input.basePriceMinor,
    currency: input.currency,
    checkInTime: input.checkInTime,
    checkOutTime: input.checkOutTime,
    createdAt: ctx.now.toISOString(),
  });
};
