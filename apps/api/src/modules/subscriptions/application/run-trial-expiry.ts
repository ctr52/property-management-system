import type { Clock } from '../../../shared/ports';
import { decideTrialExpiry, lapseTrial, renew, type Subscription } from '../domain/subscription';
import type { BillingGateway } from '../ports/gateway';
import type { PlanRepo, SubscriptionRepo } from '../ports/repos';

export type RunTrialExpiryDeps = {
  readonly subscriptions: SubscriptionRepo;
  readonly plans: PlanRepo;
  readonly gateway: BillingGateway;
  readonly clock: Clock;
  /** Короткий детерминированный ключ идемпотентности из частей (лимит ЮKassa 64 символа). Из composition root. */
  readonly idempotencyKey: (...parts: readonly string[]) => string;
};

export type TrialExpirySummary = {
  /** Сконвертированы в платный (carded, списание прошло). */
  readonly activated: number;
  /** Ушли в expired/read-only (cardless или отклонённая карта). */
  readonly lapsed: number;
  /** Пропущены до следующего тика (временный сбой шлюза / нет плана). */
  readonly skipped: number;
};

/**
 * Фоновый прогон истечения триалов (идемпотентный, безопасен к повторам):
 *  - carded + списание прошло → renew (платный период);
 *  - carded + карта отклонена → lapseTrial (read-only);
 *  - cardless → lapseTrial (read-only);
 *  - временный сбой шлюза → skip (повтор в следующий тик, тот же idempotencyKey → без двойного списания).
 *
 * read-only после лапса — БЕССРОЧНО до оплаты (продуктовое решение): данные не удаляем.
 */
export const runTrialExpiry =
  (deps: RunTrialExpiryDeps) =>
  async (): Promise<TrialExpirySummary> => {
    const now = deps.clock.now().toISOString();
    const due = await deps.subscriptions.listTrialingDueBy(now);

    let activated = 0;
    let lapsed = 0;
    let skipped = 0;

    const lapse = async (sub: Subscription): Promise<void> => {
      const r = lapseTrial(sub);
      if (r.isOk()) {
        await deps.subscriptions.save(r.value);
        lapsed += 1;
      } else {
        skipped += 1;
      }
    };

    for (const sub of due) {
      const decision = decideTrialExpiry(sub, now);

      if (decision.kind !== 'attempt_renewal' || sub.billingMethodRef === null) {
        // lapse (cardless) либо аномалия «renewal без ref» → read-only.
        await lapse(sub);
        continue;
      }

      const plan = await deps.plans.get(sub.planId);
      if (!plan) {
        skipped += 1; // план пропал из конфига — не лапсим, разберёмся вручную
        continue;
      }

      const charge = await deps.gateway.charge({
        methodRef: sub.billingMethodRef,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        description: `Подписка ${plan.name}`,
        // Стабилен для этого триала → ретрай не приводит к двойному списанию.
        idempotencyKey: deps.idempotencyKey('renew', sub.orgId, sub.trialEndsAt ?? ''),
      });

      if (charge.isErr()) {
        skipped += 1; // временный сбой → следующий тик
        continue;
      }

      if (charge.value.status === 'succeeded') {
        const r = renew(sub, { now, periodDays: plan.periodDays });
        if (r.isOk()) {
          await deps.subscriptions.save(r.value);
          activated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await lapse(sub); // карта отклонена
      }
    }

    return { activated, lapsed, skipped };
  };
