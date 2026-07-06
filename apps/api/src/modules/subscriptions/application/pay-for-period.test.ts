import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '../domain/plan';
import type { Subscription } from '../domain/subscription';
import type { BillingGateway } from '../ports/gateway';
import { payForPeriod, type PayForPeriodDeps } from './pay-for-period';

const NOW = new Date('2026-06-29T00:00:00.000Z');
const PLAN: SubscriptionPlan = { id: 'plan1', name: 'Pro', priceMinor: 290000, currency: 'RUB', trialDays: 14, periodDays: 30 };

const sub = (over: Partial<Subscription>): Subscription => ({
  orgId: 'org1',
  planId: 'plan1',
  status: 'expired',
  trialEndsAt: null,
  paymentMethodAttached: false,
  billingMethodRef: null,
  everPaid: false,
  currentPeriodEnd: null,
  ...over,
});

const makeDeps = (over: { existing?: Subscription | null; chargeStatus?: 'succeeded' | 'declined' }) => {
  const saved: Subscription[] = [];
  const intents: unknown[] = [];
  const charge = vi.fn<BillingGateway['charge']>(() => okAsync({ status: over.chargeStatus ?? 'succeeded' }));
  const checkoutPeriod = vi.fn<BillingGateway['checkoutPeriod']>(() =>
    okAsync({ kind: 'redirect' as const, url: 'https://pay.example/abc', externalId: 'pay1' }),
  );
  const deps: PayForPeriodDeps = {
    subscriptions: {
      getByOrg: async () => (over.existing === undefined ? sub({}) : over.existing),
      save: async (s) => void saved.push(s),
      listTrialingDueBy: async () => [],
    },
    plans: { get: async () => PLAN, list: async () => [PLAN] },
    gateway: { bindCard: vi.fn(), getCardBinding: vi.fn(), checkoutPeriod, getPeriodPayment: vi.fn(), charge },
    cardSetupIntents: { save: async (i) => void intents.push(i), getByPaymentId: async () => null, consume: async () => {} },
    clock: { now: () => NOW },
    idGen: () => 'idem1',
  };
  return { deps, saved, intents, charge, checkoutPeriod };
};

describe('payForPeriod', () => {
  it('нет подписки → not_found', async () => {
    const { deps } = makeDeps({ existing: null });
    expect((await payForPeriod(deps)('org1', { returnUrl: 'https://app/billing' }))._unsafeUnwrapErr().kind).toBe('not_found');
  });

  it('оплата в активном триале с картой → paid, период клеится к КОНЦУ триала', async () => {
    // trialEndsAt=2026-07-13, оплата в середине (NOW=2026-06-29). Остаток триала не сгорает.
    const { deps, saved } = makeDeps({
      existing: sub({ status: 'trialing', trialEndsAt: '2026-07-13T00:00:00.000Z', paymentMethodAttached: true, billingMethodRef: 'pm1' }),
    });
    const r = (await payForPeriod(deps)('org1', { returnUrl: 'https://app/billing' }))._unsafeUnwrap();
    expect(r.kind).toBe('paid');
    expect(saved[0]!.status).toBe('active');
    expect(saved[0]!.currentPeriodEnd).toBe('2026-08-12T00:00:00.000Z'); // 2026-07-13 + 30, а не now + 30
  });

  it('карта на файле (read-only) + списание прошло → paid, подписка active', async () => {
    const { deps, saved, charge } = makeDeps({ existing: sub({ billingMethodRef: 'pm1' }) });
    const r = (await payForPeriod(deps)('org1', { returnUrl: 'https://app/billing' }))._unsafeUnwrap();
    expect(r.kind).toBe('paid');
    expect(charge).toHaveBeenCalledOnce();
    expect(saved[0]!.status).toBe('active');
    expect(saved[0]!.everPaid).toBe(true);
  });

  it('карта на файле + отклонено → declined, подписка не меняется', async () => {
    const { deps, saved } = makeDeps({ existing: sub({ billingMethodRef: 'pm1' }), chargeStatus: 'declined' });
    const r = (await payForPeriod(deps)('org1', { returnUrl: 'https://app/billing' }))._unsafeUnwrap();
    expect(r.kind).toBe('declined');
    expect(saved).toHaveLength(0);
  });

  it('нет карты → redirect: прямая оплата на стоимость плана + отложенный intent, без charge', async () => {
    const { deps, intents, charge, checkoutPeriod } = makeDeps({ existing: sub({ billingMethodRef: null }) });
    const r = (await payForPeriod(deps)('org1', { returnUrl: 'https://app/billing' }))._unsafeUnwrap();
    expect(r.kind).toBe('redirect');
    if (r.kind === 'redirect') expect(r.setup.url).toBe('https://pay.example/abc');
    expect(checkoutPeriod).toHaveBeenCalledOnce();
    // Сумма редиректа = стоимость плана (не ₽10-холд).
    expect((checkoutPeriod.mock.calls[0]![0] as { amountMinor: number }).amountMinor).toBe(290000);
    expect(charge).not.toHaveBeenCalled();
    expect(intents).toHaveLength(1);
  });
});
