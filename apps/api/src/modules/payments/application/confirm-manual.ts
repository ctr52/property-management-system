import { err, ok, type Result } from 'neverthrow';
import type { ConfirmManualPaymentInput, PaymentLeg, PaymentView } from '@pms/shared';
import { type AppError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { transition } from '../domain/status';
import type { Payment } from '../domain/types';
import type { PaymentPlanRepo, PaymentProviderRegistry, PaymentRepo } from '../ports/repos';
import { toPaymentView } from './read-payments';

/** Запись в audit log (кросс-срез). Ручное закрытие денег обязано быть прослеживаемым. */
export type PaymentAudit = {
  readonly record: (entry: {
    readonly orgId: string;
    readonly actor: string;
    readonly action: 'payment.manual_confirm';
    readonly paymentId: string;
    readonly amountMinor: number;
  }) => Promise<void>;
};

export type ConfirmManualDeps = {
  readonly registry: PaymentProviderRegistry;
  readonly plans: PaymentPlanRepo;
  readonly payments: PaymentRepo;
  readonly audit: PaymentAudit;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

/**
 * Ручное подтверждение оплаты manual-провайдера: закрывает provider-ногу без онлайн-платежа.
 * Под permission payment:confirm (роут) + запись в audit. Идемпотентно: повторный вызов на
 * уже оплаченной ноге возвращает существующий платёж.
 */
export const confirmManualPayment =
  (deps: ConfirmManualDeps) =>
  async (
    orgId: string,
    actor: string,
    input: ConfirmManualPaymentInput,
  ): Promise<Result<PaymentView, AppError>> => {
    const plan = await deps.plans.getByReservation(orgId, input.reservationId);
    if (!plan) return err(notFoundError('План оплаты не найден'));

    const leg: PaymentLeg | undefined = plan.legs.find((l) => l.id === input.legId);
    if (!leg) return err(notFoundError('Нога оплаты не найдена'));
    if (leg.collector.kind !== 'provider') {
      return err(validationError('Эту ногу собирает площадка'));
    }

    const adapter = deps.registry.get(leg.collector.provider);
    if (!adapter || adapter.manifest.kind !== 'manual') {
      return err(validationError('Ручное подтверждение доступно только для manual-провайдера'));
    }

    // Идемпотентность: нога уже оплачена → отдаём существующий платёж.
    if (leg.status === 'paid') {
      const done = await deps.payments.getByLeg(leg.id);
      if (done) return ok(toPaymentView(done));
    }

    const now = deps.clock.now().toISOString();
    const draft: Payment = {
      id: deps.idGen(),
      orgId,
      reservationId: input.reservationId,
      legId: leg.id,
      provider: leg.collector.provider,
      amountMinor: leg.amountMinor,
      currency: leg.currency,
      status: 'created',
      idempotencyKey: `manual:${input.reservationId}:${leg.id}`,
      externalId: `manual:${leg.id}`,
      refundedMinor: 0,
      createdAt: now,
      updatedAt: now,
    };
    // created → pending → succeeded через общую статусную машину (без обхода).
    const succeeded = transition(draft, 'pending').andThen((p) => transition(p, 'succeeded'));
    if (succeeded.isErr()) return err(validationError(succeeded.error.message));
    const payment = { ...succeeded.value, updatedAt: now };
    await deps.payments.save(payment);

    await deps.plans.save(orgId, {
      ...plan,
      legs: plan.legs.map((l) => (l.id === leg.id ? { ...l, status: 'paid', paymentId: payment.id } : l)),
    });

    await deps.audit.record({
      orgId,
      actor,
      action: 'payment.manual_confirm',
      paymentId: payment.id,
      amountMinor: payment.amountMinor,
    });

    return ok(toPaymentView(payment));
  };
