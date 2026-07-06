import { err, ok, type Result } from 'neverthrow';
import type { CleaningTaskView, CreateCleaningInput } from '@pms/shared';
import { type AppError, forbiddenError, notFoundError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import * as ops from '../domain/operations';
import type { CleaningTask } from '../domain/types';
import type { CleaningEvents, CleaningTaskRepo } from '../ports';
import { toCleaningView } from './read-cleaning';

export type ManageCleaningDeps = {
  readonly tasks: CleaningTaskRepo;
  readonly events: CleaningEvents;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

/** Назначить клинера (менеджер). */
export const assignCleaning =
  (deps: ManageCleaningDeps) =>
  async (orgId: string, id: string, assigneeId: string): Promise<Result<CleaningTaskView, AppError>> => {
    const task = await deps.tasks.getById(orgId, id);
    if (!task) return err(notFoundError('Задача не найдена'));
    const result = ops.assign(task, assigneeId, deps.clock.now().toISOString());
    if (result.isErr()) return err(result.error);
    await deps.tasks.save(result.value);
    deps.events.assigned({ orgId, taskId: id, assigneeId, propertyId: task.propertyId, date: task.date });
    return ok(toCleaningView(result.value));
  };

/** Общий guard «задача моя» для действий клинера. */
const ownAction = async (
  deps: ManageCleaningDeps,
  orgId: string,
  actorId: string,
  id: string,
  op: (task: CleaningTask, now: string) => Result<CleaningTask, AppError>,
): Promise<Result<CleaningTaskView, AppError>> => {
  const task = await deps.tasks.getById(orgId, id);
  if (!task) return err(notFoundError('Задача не найдена'));
  if (task.assigneeId !== actorId) return err(forbiddenError('Это не ваша задача'));
  const result = op(task, deps.clock.now().toISOString());
  if (result.isErr()) return err(result.error);
  await deps.tasks.save(result.value);
  return ok(toCleaningView(result.value));
};

export const startCleaning =
  (deps: ManageCleaningDeps) =>
  (orgId: string, actorId: string, id: string): Promise<Result<CleaningTaskView, AppError>> =>
    ownAction(deps, orgId, actorId, id, ops.start);

export const completeCleaning =
  (deps: ManageCleaningDeps) =>
  (orgId: string, actorId: string, id: string): Promise<Result<CleaningTaskView, AppError>> =>
    ownAction(deps, orgId, actorId, id, ops.complete);

/** Ручное создание задачи (помимо авто-генерации). */
export const createCleaning =
  (deps: ManageCleaningDeps) =>
  async (orgId: string, input: CreateCleaningInput): Promise<Result<CleaningTaskView, AppError>> => {
    const now = deps.clock.now().toISOString();
    const task: CleaningTask = {
      id: deps.idGen(),
      orgId,
      propertyId: input.propertyId,
      reservationId: null,
      date: input.date,
      status: 'todo',
      assigneeId: null,
      guestName: null,
      createdAt: now,
      updatedAt: now,
    };
    await deps.tasks.save(task);
    deps.events.created({ orgId, taskId: task.id, propertyId: input.propertyId, date: input.date });
    return ok(toCleaningView(task));
  };
