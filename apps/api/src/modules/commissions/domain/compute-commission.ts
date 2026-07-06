import type { CommissionRule } from '@pms/shared';

export type CommissionAmounts = {
  readonly commissionMinor: number;
  readonly netMinor: number;
};

/**
 * Чистый расчёт комиссии по правилу: percentBips (базисные пункты) + фикс.
 * commission = round(amount * percentBips / 10000) + fixedMinor, зажат в [0, amount].
 * Без правила (null) — комиссия 0, всё идёт арендодателю.
 */
export const commissionFor = (amountMinor: number, rule: CommissionRule | null): CommissionAmounts => {
  if (!rule || amountMinor <= 0) return { commissionMinor: 0, netMinor: Math.max(0, amountMinor) };
  const raw = Math.round((amountMinor * rule.percentBips) / 10_000) + rule.fixedMinor;
  const commissionMinor = Math.min(amountMinor, Math.max(0, raw));
  return { commissionMinor, netMinor: amountMinor - commissionMinor };
};
