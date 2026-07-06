import { err, ok, type Result } from 'neverthrow';
import type { BuildDirectPlanInput, PaymentPlan } from '@pms/shared';
import { type AppError, validationError } from '../../../shared/errors';
import type { IdGen } from '../../../shared/ports';
import { buildPlanWithRemainder } from '../domain/plan';
import type { PaymentPlanRepo, PaymentProviderRegistry } from '../ports/repos';

export type BuildPlanDeps = {
  readonly plans: PaymentPlanRepo;
  readonly registry: PaymentProviderRegistry;
  readonly idGen: IdGen;
};

/**
 * Прямой план (бронь без площадки): вся сумма — одна provider-нога. Переиспользует чистое ядро
 * buildPlanWithRemainder с пустым channelLegs. Площадко-зависимая раскладка — отдельный поток
 * через ChannelSplitSource (ADR-0001), модуль channel здесь не задействован.
 */
export const buildDirectPlan =
  (deps: BuildPlanDeps) =>
  async (orgId: string, input: BuildDirectPlanInput): Promise<Result<PaymentPlan, AppError>> => {
    if (!deps.registry.get(input.provider)) {
      return err(validationError(`Неизвестный провайдер: ${input.provider}`));
    }
    const plan = buildPlanWithRemainder({
      reservationId: input.reservationId,
      currency: input.currency,
      totalMinor: input.totalMinor,
      channelLegs: [],
      provider: input.provider,
      newLegId: deps.idGen,
    });
    if (plan.isErr()) return err(validationError(plan.error.message));
    await deps.plans.save(orgId, plan.value);
    return ok(plan.value);
  };
