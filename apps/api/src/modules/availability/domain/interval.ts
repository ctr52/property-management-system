import { err, ok, type Result } from 'neverthrow';
import { type AppError, validationError } from '../../../shared/errors';

/**
 * Пересечение полуоткрытых интервалов [aFrom,aTo) и [bFrom,bTo).
 * Строки 'YYYY-MM-DD' сравниваются лексикографически = хронологически.
 * Смежность (конец одного = начало другого) пересечением НЕ считается (back-to-back ок).
 */
export const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean =>
  aFrom < bTo && bFrom < aTo;

/** Дата въезда строго раньше выезда. */
export const validateRange = (from: string, to: string): Result<void, AppError> =>
  from < to ? ok(undefined) : err(validationError('Дата конца должна быть позже начала'));
