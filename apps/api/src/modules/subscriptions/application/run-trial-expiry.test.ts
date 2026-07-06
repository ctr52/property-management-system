import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '../domain/plan';
import { beginTrial, type Subscription } from '../domain/subscription';
import type { BillingGateway } from '../ports/gateway';
import { runTrialExpiry, type RunTrialExpiryDeps } from './run-trial-expiry';

const PLAN: SubscriptionPlan = { id: 'pro', name: 'Pro', priceMinor: 290000, currency: 'RUB', trialDays: 14, periodDays: 30 };
const NOW = new Date('2026-07-20T00:00:00.000Z'); // позже trialEndsAt

const trial = (over: Partial<Subscription>): Subscription => ({
  ...beginTrial({ orgId: 'org1', planId: 'pro', trialDays: 14, now: '2026-06-29T00:00:00.000Z', withCard: false })._unsafeUnwrap(),
  ...over,
});

const makeDeps = (due: Subscription[], charge?: BillingGateway['charge']) => {
  const saved: Subscription[] = [];
  const gateway = {
    bindCard: vi.fn(),
    getCardBinding: vi.fn(),
    checkoutPeriod: vi.fn(),
    getPeriodPayment: vi.fn(),
    charge: charge ?? vi.fn(() => okAsync({ status: 'succeeded' as const })),
  } as unknown as BillingGateway;
  const deps: RunTrialExpiryDeps = {
    subscriptions: {
      getByOrg: async () => null,
      save: async (s) => void saved.push(s),
      listTrialingDueBy: async () => due,
    },
    plans: { get: async () => PLAN, list: async () => [PLAN] },
    gateway,
    clock: { now: () => NOW },
  };
  return { deps, saved, gateway };
};

describe('runTrialExpiry', () => {
  it('cardless истёкший → lapse (expired, read-only)', async () => {
    const { deps, saved } = makeDeps([trial({ orgId: 'org1', billingMethodRef: null })]);
    const summary = await runTrialExpiry(deps)();
    expect(summary).toEqual({ activated: 0, lapsed: 1, skipped: 0 });
    expect(saved[0]!.status).toBe('expired');
  });

  it('carded + списание прошло → renew (платный период)', async () => {
    const { deps, saved, gateway } = makeDeps([
      trial({ orgId: 'org2', paymentMethodAttached: true, billingMethodRef: 'pm_1' }),
    ]);
    const summary = await runTrialExpiry(deps)();
    expect(summary).toEqual({ activated: 1, lapsed: 0, skipped: 0 });
    expect(saved[0]!.status).toBe('active');
    expect(saved[0]!.everPaid).toBe(true);
    const chargeArgs = (gateway.charge as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(chargeArgs.amountMinor).toBe(290000);
    // Ключ идемпотентности — короткий хэш (лимит ЮKassa 64 символа), детерминированный.
    expect(chargeArgs.idempotencyKey.length).toBeLessThanOrEqual(64);
    expect(chargeArgs.idempotencyKey).toMatch(/^[0-9a-f]+$/);
  });

  it('carded + карта отклонена → lapse', async () => {
    const { deps, saved } = makeDeps(
      [trial({ orgId: 'org3', paymentMethodAttached: true, billingMethodRef: 'pm_x' })],
      () => okAsync({ status: 'declined' as const }),
    );
    const summary = await runTrialExpiry(deps)();
    expect(summary).toEqual({ activated: 0, lapsed: 1, skipped: 0 });
    expect(saved[0]!.status).toBe('expired');
  });

  it('временный сбой шлюза → skip, подписка не тронута (повтор в след. тик)', async () => {
    const { deps, saved } = makeDeps(
      [trial({ orgId: 'org4', paymentMethodAttached: true, billingMethodRef: 'pm_y' })],
      () => errAsync({ code: 'gateway_error', message: 'таймаут' }),
    );
    const summary = await runTrialExpiry(deps)();
    expect(summary).toEqual({ activated: 0, lapsed: 0, skipped: 1 });
    expect(saved).toHaveLength(0);
  });
});
