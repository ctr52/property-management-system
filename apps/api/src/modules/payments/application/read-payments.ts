import type { PaymentView } from '@pms/shared';
import type { Payment } from '../domain/types';
import type { PaymentRepo } from '../ports/repos';

export const toPaymentView = (p: Payment): PaymentView => ({
  id: p.id,
  orgId: p.orgId,
  reservationId: p.reservationId,
  legId: p.legId,
  provider: p.provider,
  amountMinor: p.amountMinor,
  currency: p.currency,
  status: p.status,
  createdAt: p.createdAt,
});

export type ReadPaymentsDeps = {
  readonly payments: PaymentRepo;
};

/** Платежи брони (только provider-ноги). Статус channel-ног живёт в плане, не здесь. */
export const listReservationPayments =
  (deps: ReadPaymentsDeps) =>
  async (orgId: string, reservationId: string): Promise<PaymentView[]> =>
    (await deps.payments.listByReservation(orgId, reservationId)).map(toPaymentView);
