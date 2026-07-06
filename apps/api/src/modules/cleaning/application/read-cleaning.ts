import type { CleaningTaskView } from '@pms/shared';
import type { CleaningTask } from '../domain/types';
import type { CleaningTaskRepo } from '../ports';

export const toCleaningView = (t: CleaningTask): CleaningTaskView => ({
  id: t.id,
  propertyId: t.propertyId,
  reservationId: t.reservationId,
  date: t.date,
  status: t.status,
  assigneeId: t.assigneeId,
  guestName: t.guestName,
  createdAt: t.createdAt,
});

/** Доска уборок организации (для менеджера). */
export const listCleaningBoard =
  (deps: { tasks: CleaningTaskRepo }) =>
  async (orgId: string): Promise<CleaningTaskView[]> =>
    (await deps.tasks.listByOrg(orgId)).map(toCleaningView);

/** Мои задачи (для клинера). */
export const listMyCleaning =
  (deps: { tasks: CleaningTaskRepo }) =>
  async (orgId: string, assigneeId: string): Promise<CleaningTaskView[]> =>
    (await deps.tasks.listByAssignee(orgId, assigneeId)).map(toCleaningView);
