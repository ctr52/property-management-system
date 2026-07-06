import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '../domain/plan';
import type { Subscription } from '../domain/subscription';
import type { BillingGateway, PeriodPayment } from '../ports/gateway';
import type { CardSetupIntent } from '../ports/repos';
import { confirmPeriodPayment, type ConfirmPeriodPaymentDeps } from './confirm-period-payment';

const NOW = new Date('2026-06-29T00:00:00.000Z');
const PLAN: SubscriptionPlan = { id: 'plan1', name: 'Pro', priceMinor: 290000, currency: 'RUB', trialDays: 14, periodDays: 30 };
const INTENT: CardSetupIntent = { paymentId: 'pay1', orgId: 'org1', planId: 'plan1', phoneE164: '', createdAt: NOW.toISOString() };

const trialing = (over: Partial<Subscription> = {}): Subscription => ({
  orgId: 'org1',
  planId: 'plan1',
  status: 'trialing',
  trialEndsAt: '2026-07-13T00:00:00.000Z',
  currentPeriodEnd: null,
  paymentMethodAttached: false,
  billingMethodRef: null,
  everPaid: false,
  ...over,
});

const makeDeps = (over: { intent?: CardSetupIntent | null; existing?: Subscription | null; payment?: PeriodPayment }) => {
  const saved: Subscription[] = [];
  const intentStore = new Map<string, CardSetupIntent>();
  if (over.intent !== null) intentStore.set(INTENT.paymentId, over.intent ?? INTENT);
  const deps: ConfirmPeriodPaymentDeps = {
    gateway: {
      bindCard: vi.fn(),
      getCardBinding: vi.fn(),
      checkoutPeriod: vi.fn(),
      getPeriodPayment: () => okAsync(over.payment ?? { status: 'succeeded', cardFingerprint: 'fp1', paymentMethodId: 'pm1' }),
      charge: vi.fn(),
    } as unknown as BillingGateway,
    cardSetupIntents: {
      save: async (i) => void intentStore.set(i.paymentId, i),
      getByPaymentId: async (id) => intentStore.get(id) ?? null,
      consume: async (id) => void intentStore.delete(id),
    },
    subscriptions: { getByOrg: async () => over.existing ?? null, save: async (s) => void saved.push(s), listTrialingDueBy: async () => [] },
    plans: { get: async () => PLAN, list: async () => [PLAN] },
    clock: { now: () => NOW },
  };
  return { deps, saved, intentStore };
};

describe('confirmPeriodPayment', () => {
  it('нет intent → ignored', async () => {
    const { deps } = makeDeps({ intent: null });
    expect((await confirmPeriodPayment(deps)('payX'))._unsafeUnwrap()).toBe('ignored');
  });

  it('платёж не завершён → pending (intent не потребляем)', async () => {
    const { deps, intentStore } = makeDeps({ existing: trialing(), payment: { status: 'pending', cardFingerprint: null, paymentMethodId: null } });
    expect((await confirmPeriodPayment(deps)('pay1'))._unsafeUnwrap()).toBe('pending');
    expect(intentStore.has('pay1')).toBe(true);
  });

  it('платёж отменён → declined, intent потреблён', async () => {
    const { deps, saved, intentStore } = makeDeps({ existing: trialing(), payment: { status: 'canceled', cardFingerprint: null, paymentMethodId: null } });
    expect((await confirmPeriodPayment(deps)('pay1'))._unsafeUnwrap()).toBe('declined');
    expect(saved).toHaveLength(0);
    expect(intentStore.has('pay1')).toBe(false);
  });

  it('оплата в триале → paid: период клеится к концу триала + карта сохранена', async () => {
    const { deps, saved } = makeDeps({ existing: trialing() });
    expect((await confirmPeriodPayment(deps)('pay1'))._unsafeUnwrap()).toBe('paid');
    expect(saved[0]!.status).toBe('active');
    expect(saved[0]!.currentPeriodEnd).toBe('2026-08-12T00:00:00.000Z'); // 2026-07-13 + 30
    expect(saved[0]!.billingMethodRef).toBe('pm1'); // карта сохранена для автобиллинга
  });

  it('реактивация из read-only → paid, период от now', async () => {
    const expired = trialing({ status: 'expired', trialEndsAt: null });
    const { deps, saved } = makeDeps({ existing: expired });
    expect((await confirmPeriodPayment(deps)('pay1'))._unsafeUnwrap()).toBe('paid');
    expect(saved[0]!.status).toBe('active');
    expect(saved[0]!.currentPeriodEnd).toBe('2026-07-29T00:00:00.000Z'); // now + 30
  });

  it('повторный вебхук → ignored (intent одноразовый)', async () => {
    const { deps, saved } = makeDeps({ existing: trialing() });
    await confirmPeriodPayment(deps)('pay1');
    expect((await confirmPeriodPayment(deps)('pay1'))._unsafeUnwrap()).toBe('ignored');
    expect(saved).toHaveLength(1);
  });

  it('подписки нет → ignored (оплата всегда по существующей)', async () => {
    const { deps, saved } = makeDeps({ existing: null });
    expect((await confirmPeriodPayment(deps)('pay1'))._unsafeUnwrap()).toBe('ignored');
    expect(saved).toHaveLength(0);
  });
});
