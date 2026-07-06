import { err, ok, type Result } from 'neverthrow';
import type { Property, UpdatePropertyInput } from '@pms/shared';
import { type AppError, validationError } from '../../../shared/errors';

const MAX_BASE_PRICE_MINOR = 100_000_000;

/**
 * Чистая функция: применяет правки к существующему объекту. Без IO.
 */
export const applyPropertyEdits = (
  property: Property,
  patch: UpdatePropertyInput,
): Result<Property, AppError> => {
  const title = patch.title !== undefined ? patch.title.trim() : property.title;
  if (title.length === 0) {
    return err(validationError('Название не может быть пустым'));
  }
  const address = patch.address !== undefined ? patch.address.trim() : property.address;
  if (address.length === 0) {
    return err(validationError('Адрес не может быть пустым'));
  }
  if (patch.basePriceMinor !== undefined && patch.basePriceMinor > MAX_BASE_PRICE_MINOR) {
    return err(validationError('Базовая цена слишком большая'));
  }

  return ok({
    ...property,
    title,
    address,
    basePriceMinor: patch.basePriceMinor ?? property.basePriceMinor,
    checkInTime: patch.checkInTime ?? property.checkInTime,
    checkOutTime: patch.checkOutTime ?? property.checkOutTime,
  });
};
