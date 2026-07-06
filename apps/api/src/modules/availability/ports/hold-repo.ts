import type { Result } from 'neverthrow';
import type { AppError } from '../../../shared/errors';
import type { AvailabilityHold } from '../domain/types';

/** Результат вставки: сам hold + вытесненные tentative-холды (для firm-вставки). */
export type InsertResult = {
  readonly hold: AvailabilityHold;
  readonly preempted: readonly AvailabilityHold[];
};

export type HoldRepo = {
  /**
   * Атомарный choke-point (лок строки объекта). «Активный» холд = firm ИЛИ неистёкший tentative.
   *  - firm: запрещён поверх активного firm; вытесняет (удаляет) пересекающиеся tentative → preempted;
   *  - tentative: запрещён поверх любого активного (firm или tentative).
   * Истёкшие tentative игнорируются (ленивое истечение). now — момент оценки срока.
   */
  readonly insertIfFree: (hold: AvailabilityHold, now: string) => Promise<Result<InsertResult, AppError>>;
  /** Промоушн tentative → firm (оплата/подтверждение): tier='firm', expiresAt=null. */
  readonly promote: (orgId: string, id: string, now: string) => Promise<void>;
  /** Снять истёкшие tentative (sweeper) — удаляет и возвращает их (для статусов броней/событий). */
  readonly releaseExpired: (now: string) => Promise<AvailabilityHold[]>;
  /** Holds, пересекающие диапазон (для read-model календаря; фильтрация срока — на стороне вызова). */
  readonly listForRange: (orgId: string, from: string, to: string) => Promise<AvailabilityHold[]>;
  readonly getById: (orgId: string, id: string) => Promise<AvailabilityHold | null>;
  readonly remove: (orgId: string, id: string) => Promise<void>;
};
