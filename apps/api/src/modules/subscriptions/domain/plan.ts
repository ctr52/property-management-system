/**
 * Тарифный план подписки на PMS (то, за что платит организация нам).
 * Не путать с `payments/domain/plan.ts` — там план оплаты брони гостем.
 *
 * `trialDays` — продуктовая политика длины триала на плане (типично 2–4 нед., дефолт
 * DEFAULT_TRIAL_DAYS); валидируется доменом подписки при beginTrial.
 */
export type SubscriptionPlan = {
  readonly id: string;
  readonly name: string;
  /** Цена за период в minor units (копейки). */
  readonly priceMinor: number;
  readonly currency: string;
  /** Длина триала в днях. */
  readonly trialDays: number;
  /** Длина оплаченного периода в днях (напр. 30). */
  readonly periodDays: number;
};
