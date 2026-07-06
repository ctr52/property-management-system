import type { CleaningTask } from './domain/types';

export type CleaningTaskRepo = {
  readonly save: (task: CleaningTask) => Promise<void>;
  readonly getById: (orgId: string, id: string) => Promise<CleaningTask | null>;
  /** Кросс-орг (системный reconcile): задача по брони-источнику. */
  readonly getByReservationId: (reservationId: string) => Promise<CleaningTask | null>;
  readonly listByOrg: (orgId: string) => Promise<CleaningTask[]>;
  readonly listByAssignee: (orgId: string, assigneeId: string) => Promise<CleaningTask[]>;
  /** Кросс-орг: открытые задачи (todo/assigned) с привязкой к брони — для отмены «осиротевших». */
  readonly listOpenWithReservation: () => Promise<CleaningTask[]>;
};

/** Выезд, требующий уборки. Реализуется в composition root поверх Reservations (low coupling). */
export type Turnover = {
  readonly orgId: string;
  readonly reservationId: string;
  readonly propertyId: string;
  readonly checkOut: string;
  readonly guestName: string;
};

export type CleaningReservationSource = {
  /** Подтверждённые (firm) брони, требующие уборки на выезд. */
  readonly confirmedTurnovers: () => Promise<Turnover[]>;
};

/** События уборки в шину (для уведомлений). Реализуется в composition root поверх EventBus. */
export type CleaningEvents = {
  readonly created: (e: { orgId: string; taskId: string; propertyId: string; date: string }) => void;
  readonly assigned: (e: {
    orgId: string;
    taskId: string;
    assigneeId: string;
    propertyId: string;
    date: string;
  }) => void;
};
