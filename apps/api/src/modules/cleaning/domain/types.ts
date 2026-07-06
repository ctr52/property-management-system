import type { CleaningStatus } from '@pms/shared';

export type { CleaningStatus };

/** Задача уборки (turnover от выезда либо ручная). */
export type CleaningTask = {
  readonly id: string;
  readonly orgId: string;
  readonly propertyId: string;
  /** Бронь-источник (для авто-генерации/идемпотентности); null для ручных задач. */
  readonly reservationId: string | null;
  readonly date: string; // YYYY-MM-DD (дата выезда)
  readonly status: CleaningStatus;
  readonly assigneeId: string | null;
  readonly guestName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};
