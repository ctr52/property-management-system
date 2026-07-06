import type { HoldKind, HoldTier } from '@pms/shared';

export type { HoldKind, HoldTier };

/** Занятость объекта: полуоткрытый интервал ночей [from, to). */
export type AvailabilityHold = {
  readonly id: string;
  readonly orgId: string;
  readonly propertyId: string;
  readonly from: string; // YYYY-MM-DD включительно
  readonly to: string; // YYYY-MM-DD исключительно
  readonly kind: HoldKind;
  /** firm — жёсткий; tentative — мягкий, истекает по expiresAt и вытесняется firm'ом. */
  readonly tier: HoldTier;
  /** ISO-время истечения tentative-холда; null для firm/block/cleaning. */
  readonly expiresAt: string | null;
  readonly refId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
};
