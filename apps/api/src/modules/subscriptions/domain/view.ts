import type { SubscriptionView } from '@pms/shared';
import { isReadOnly, type Subscription } from './subscription';

/** Маппер доменной подписки в представление для UI (pure). */
export const toSubscriptionView = (s: Subscription): SubscriptionView => ({
  planId: s.planId,
  status: s.status,
  trialEndsAt: s.trialEndsAt,
  paymentMethodAttached: s.paymentMethodAttached,
  currentPeriodEnd: s.currentPeriodEnd,
  readOnly: isReadOnly(s),
});
