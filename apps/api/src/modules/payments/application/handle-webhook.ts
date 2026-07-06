import { ok, type Result } from 'neverthrow';
import type { PaymentLegStatus } from '@pms/shared';
import { transition } from '../domain/status';
import type { Payment, PaymentError, PaymentEvent } from '../domain/types';
import type {
  PaymentAccountRepo,
  PaymentInbox,
  PaymentPlanRepo,
  PaymentProviderRegistry,
  PaymentRepo,
} from '../ports/repos';
import type { RawWebhookRequest } from '../ports/provider';

export type HandlePaymentWebhookDeps = {
  readonly registry: PaymentProviderRegistry;
  readonly accounts: PaymentAccountRepo;
  readonly payments: PaymentRepo;
  readonly plans: PaymentPlanRepo;
  readonly inbox: PaymentInbox;
  /** Оплата прошла → подтвердить бронь + уведомить (pending → confirmed, tentative → firm). */
  readonly onPaid?: (
    orgId: string,
    reservationId: string,
    amountMinor: number,
    currency: string,
  ) => Promise<void>;
};

const LEG_STATUS: Readonly<Record<PaymentEvent['outcome'], PaymentLegStatus>> = {
  succeeded: 'paid',
  failed: 'failed',
  refunded: 'refunded',
};

/** Довести платёж до целевого статуса легальным путём статусной машины (created→pending→…). */
const advance = (payment: Payment, outcome: PaymentEvent['outcome']): Result<Payment, PaymentError> => {
  if (outcome === 'succeeded') {
    const pending = payment.status === 'created' ? transition(payment, 'pending') : ok(payment);
    return pending.andThen((p) => (p.status === 'succeeded' ? ok(p) : transition(p, 'succeeded')));
  }
  if (outcome === 'failed') {
    return payment.status === 'failed' ? ok(payment) : transition(payment, 'failed');
  }
  return payment.status === 'refunded' ? ok(payment) : transition(payment, 'refunded');
};

/**
 * Приём вебхука провайдера (по неугадываемому accountId в URL). Симметрия channel handleWebhook:
 * verify → parse → дедуп inbox → статус Payment + статус ноги в плане. Чужое/битое тихо игнорим.
 */
export const handlePaymentWebhook =
  (deps: HandlePaymentWebhookDeps) =>
  async (provider: string, accountId: string, req: RawWebhookRequest): Promise<void> => {
    const account = await deps.accounts.getById(accountId);
    if (!account || account.provider !== provider || account.status !== 'active') return;

    const adapter = deps.registry.get(provider);
    if (!adapter?.verifyWebhook || !adapter.parseWebhook) return;
    if ((await adapter.verifyWebhook(account, req)).isErr()) return;

    const parsed = await adapter.parseWebhook(account, req);
    if (parsed.isErr()) return;

    for (const event of parsed.value) {
      const { deduped } = await deps.inbox.append(`${provider}:${event.externalId}`, event);
      if (deduped) continue;

      const payment = event.paymentId
        ? await deps.payments.getById(account.orgId, event.paymentId)
        : await deps.payments.getByExternalId(provider, event.externalId);
      if (!payment) continue; // неизвестный платёж — игнорируем

      const advanced = advance({ ...payment, externalId: payment.externalId ?? event.externalId }, event.outcome);
      if (advanced.isErr()) continue; // нелегальный переход — пропускаем

      await deps.payments.save({ ...advanced.value, updatedAt: new Date().toISOString() });

      const plan = await deps.plans.getByReservation(account.orgId, payment.reservationId);
      if (plan) {
        await deps.plans.save(account.orgId, {
          ...plan,
          legs: plan.legs.map((l) =>
            l.id === payment.legId ? { ...l, status: LEG_STATUS[event.outcome] } : l,
          ),
        });
      }

      // Оплата прошла → подтвердить бронь (pending → confirmed, tentative-холд → firm) + уведомить.
      if (event.outcome === 'succeeded') {
        await deps.onPaid?.(account.orgId, payment.reservationId, payment.amountMinor, payment.currency);
      }
    }
  };
