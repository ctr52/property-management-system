import { err, ok, type Result } from 'neverthrow';
import { type AppError, validationError } from '../../../shared/errors';
import type { CleaningStatus, CleaningTask } from './types';

const TERMINAL: ReadonlySet<CleaningStatus> = new Set(['done', 'cancelled']);

/** Назначить клинера (из todo или переназначить assigned) → status assigned. */
export const assign = (task: CleaningTask, assigneeId: string, now: string): Result<CleaningTask, AppError> =>
  task.status === 'todo' || task.status === 'assigned'
    ? ok({ ...task, assigneeId, status: 'assigned', updatedAt: now })
    : err(validationError(`Нельзя назначить задачу в статусе ${task.status}`));

/** Взять в работу (только назначенную). */
export const start = (task: CleaningTask, now: string): Result<CleaningTask, AppError> =>
  task.status === 'assigned'
    ? ok({ ...task, status: 'in_progress', updatedAt: now })
    : err(validationError('Взять в работу можно только назначенную задачу'));

/** Завершить (из assigned/in_progress). */
export const complete = (task: CleaningTask, now: string): Result<CleaningTask, AppError> =>
  task.status === 'assigned' || task.status === 'in_progress'
    ? ok({ ...task, status: 'done', updatedAt: now })
    : err(validationError('Завершить можно только назначенную или начатую задачу'));

/** Отменить (любую не-терминальную). Идемпотентно: терминальную не трогаем. */
export const cancel = (task: CleaningTask, now: string): CleaningTask =>
  TERMINAL.has(task.status) ? task : { ...task, status: 'cancelled', updatedAt: now };
