import { err, ok, type Result } from 'neverthrow';
import type { InitPaymentInput, PaymentInitResult, PaymentLeg } from '@pms/shared';
import { type AppError, notFoundError, validationError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { transition } from '../domain/status';
import type { Payment, PaymentIntent } from '../domain/types';
import type { PaymentAccount } from '../ports/provider';
import type {
  PaymentAccountRepo,
  PaymentPlanRepo,
  PaymentProviderRegistry,
  PaymentRepo,
} from '../ports/repos';

export type InitPaymentDeps = {
  readonly registry: PaymentProviderRegistry;
  readonly accounts: PaymentAccountRepo;
  readonly plans: PaymentPlanRepo;
  readonly payments: PaymentRepo;
  readonly idGen: IdGen;
  readonly clock: Clock;
  readonly publicBaseUrl: string;
};

const activeAccountFor = async (
  accounts: PaymentAccountRepo,
  orgId: string,
  provider: string,
): Promise<PaymentAccount | null> =>
  (await accounts.listByOrg(orgId)).find((a) => a.provider === provider && a.status === 'active') ?? null;

/**
 * Инициировать оплату provider-ноги → redirect-инструкция гостю. Идемпотентность исходящего:
 * ключ = reservationId:legId, повторный init переиспользует тот же Payment.
 */
export const initPayment =
  (deps: InitPaymentDeps) =>
  async (
    orgId: string,
    input: InitPaymentInput,
    returnUrl: string,
  ): Promise<Result<PaymentInitResult, AppError>> => {
    const plan = await deps.plans.getByReservation(orgId, input.reservationId);
    if (!plan) return err(notFoundError('План оплаты не найден'));

    const leg: PaymentLeg | undefined = plan.legs.find((l) => l.id === input.legId);
    if (!leg) return err(notFoundError('Нога оплаты не найдена'));
    if (leg.collector.kind !== 'provider') {
      return err(validationError('Эту ногу собирает площадка, инициировать оплату нельзя'));
    }

    const provider = leg.collector.provider;
    const adapter = deps.registry.get(provider);
    if (!adapter) return err(validationError(`Провайдер ${provider} недоступен`));

    const account = await activeAccountFor(deps.accounts, orgId, provider);
    if (!account) return err(validationError(`Провайдер ${provider} не подключён`));

    const now = deps.clock.now().toISOString();
    const idempotencyKey = `${input.reservationId}:${input.legId}`;
    const existing = await deps.payments.getByLeg(leg.id);
    const payment: Payment = existing ?? {
      id: deps.idGen(),
      orgId,
      reservationId: input.reservationId,
      legId: leg.id,
      provider,
      amountMinor: leg.amountMinor,
      currency: leg.currency,
      status: 'created',
      idempotencyKey,
      externalId: null,
      refundedMinor: 0,
      createdAt: now,
      updatedAt: now,
    };

    const intent: PaymentIntent = {
      paymentId: payment.id,
      orgId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      description: `Оплата брони ${input.reservationId}`,
      purpose: leg.purpose,
      returnUrl, // куда вернуть браузер после оплаты (гость → /guest/:token; сотрудник → /payment/return)
      idempotencyKey,
    };

    const instruction = await adapter.initPayment(account, intent);
    if (instruction.isErr()) return err(validationError(instruction.error.message));

    // created → pending (если уже pending — оставляем как есть, повторный init).
    const pending = payment.status === 'created' ? transition(payment, 'pending') : ok(payment);
    if (pending.isErr()) return err(validationError(pending.error.message));
    // externalId, назначенный провайдером на init (напр. Robokassa InvId) — для резолва вебхука.
    const externalId = instruction.value.externalId ?? pending.value.externalId;
    await deps.payments.save({ ...pending.value, externalId, updatedAt: now });

    await deps.plans.save(orgId, {
      ...plan,
      legs: plan.legs.map((l) => (l.id === leg.id ? { ...l, paymentId: payment.id } : l)),
    });

    return ok({ paymentId: payment.id, redirectUrl: instruction.value.url });
  };
