import type { Result } from 'neverthrow';
import type { HoldTier } from '@pms/shared';
import type { AppError } from '../../../shared/errors';

export type HoldRequest = {
  readonly orgId: string;
  readonly propertyId: string;
  readonly from: string;
  readonly to: string;
  readonly refId: string;
  readonly note: string | null;
  /** firm — подтверждённая бронь; tentative — мягкий захват (с expiresAt). */
  readonly tier: HoldTier;
  /** ISO-срок для tentative; null для firm. */
  readonly expiresAt: string | null;
};

export type HoldResult = {
  readonly id: string;
  /** refId вытесненных tentative-броней (firm-захват выбил их) — пометить 'preempted'. */
  readonly preemptedRefIds: readonly string[];
};

/** refId брони, чей tentative-холд истёк (для статуса 'expired'). */
export type ExpiredRef = { readonly orgId: string; readonly refId: string };

/**
 * Узкий порт доступности для броней: захватить/освободить/повысить/собрать истёкшие.
 * Реализуется в composition root поверх модуля Availability — Reservations не знает про холды.
 */
export type AvailabilityPort = {
  readonly hold: (req: HoldRequest) => Promise<Result<HoldResult, AppError>>;
  readonly release: (orgId: string, holdId: string) => Promise<void>;
  /** tentative → firm (по факту оплаты/подтверждения). */
  readonly promote: (orgId: string, holdId: string) => Promise<void>;
  /** Снять истёкшие tentative и вернуть их refId (для sweeper'а). */
  readonly releaseExpired: () => Promise<ExpiredRef[]>;
};
