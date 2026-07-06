import type { Clock, IdGen } from '../../../shared/ports';
import { cancel } from '../domain/operations';
import type { CleaningTask } from '../domain/types';
import type { CleaningEvents, CleaningReservationSource, CleaningTaskRepo } from '../ports';

export type ReconcileCleaningDeps = {
  readonly tasks: CleaningTaskRepo;
  readonly reservations: CleaningReservationSource;
  readonly events: CleaningEvents;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

/**
 * Самозалечивающийся reconcile (pull, decoupled — Reservations не знает про Cleaning):
 *  1) на каждый подтверждённый выезд гарантирует задачу уборки (идемпотентно по reservationId);
 *  2) отменяет «осиротевшие» открытые задачи, чья бронь больше не подтверждена.
 * Отказоустойчиво: пропущенное на сбое восстановится на следующем тике.
 */
export const reconcileCleaning =
  (deps: ReconcileCleaningDeps) =>
  async (): Promise<void> => {
    const turnovers = await deps.reservations.confirmedTurnovers();
    const now = deps.clock.now().toISOString();

    for (const t of turnovers) {
      if (await deps.tasks.getByReservationId(t.reservationId)) continue;
      const task: CleaningTask = {
        id: deps.idGen(),
        orgId: t.orgId,
        propertyId: t.propertyId,
        reservationId: t.reservationId,
        date: t.checkOut,
        status: 'todo',
        assigneeId: null,
        guestName: t.guestName,
        createdAt: now,
        updatedAt: now,
      };
      await deps.tasks.save(task);
      deps.events.created({ orgId: t.orgId, taskId: task.id, propertyId: t.propertyId, date: t.checkOut });
    }

    const activeResIds = new Set(turnovers.map((t) => t.reservationId));
    for (const task of await deps.tasks.listOpenWithReservation()) {
      if (task.reservationId && !activeResIds.has(task.reservationId)) {
        await deps.tasks.save(cancel(task, now));
      }
    }
  };
