import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '../domain/plan';
import type { Subscription } from '../domain/subscription';
import type { BillingGateway, CardSetupResult } from '../ports/gateway';
import type { CardSetupIntent } from '../ports/repos';
import { confirmCardSetup, type ConfirmCardSetupDeps } from './confirm-card-setup';

const NOW = new Date('2026-06-29T00:00:00.000Z');
const PLAN: SubscriptionPlan = { id: 'plan1', name: 'Pro', priceMinor: 290000, currency: 'RUB', trialDays: 14, periodDays: 30 };
const INTENT: CardSetupIntent = { paymentId: 'pay1', orgId: 'org1', planId: 'plan1', phoneE164: '+79990000000', createdAt: NOW.toISOString() };

const makeDeps = (over: {
  intent?: CardSetupIntent | null;
  existing?: Subscription | null;
  setup?: CardSetupResult;
  cardUsed?: boolean;
  chargeStatus?: 'succeeded' | 'declined';
}) => {
  const saved: Subscription[] = [];
  const markedCards: string[] = [];
  const releaseHold = vi.fn<BillingGateway['releaseHold']>(() => okAsync(undefined));
  const charge = vi.fn<BillingGateway['charge']>(() => okAsync({ status: over.chargeStatus ?? 'succeeded' }));
  const deps: ConfirmCardSetupDeps = {
    gateway: {
      setupPaymentMethod: vi.fn(),
      getSetupResult: () => okAsync(over.setup ?? { status: 'held', cardFingerprint: 'fp1', paymentMethodId: 'pm1' }),
      releaseHold,
      charge,
    },
    cardSetupIntents: {
      save: vi.fn(),
      getByPaymentId: async () => (over.intent === undefined ? INTENT : over.intent),
    },
    subscriptions: { getByOrg: async () => over.existing ?? null, save: async (s) => void saved.push(s), listTrialingDueBy: async () => [] },
    plans: { get: async () => PLAN, list: async () => [PLAN] },
    cardLedger: {
      hasUsedTrial: async () => over.cardUsed ?? false,
      markUsed: async (fp) => void markedCards.push(fp),
    },
    clock: { now: () => NOW },
    idGen: () => 'idem1',
  };
  return { deps, saved, markedCards, releaseHold, charge };
};

describe('confirmCardSetup', () => {
  it('платёж не наш (нет intent) → ignored', async () => {
    const { deps } = makeDeps({ intent: null });
    expect((await confirmCardSetup(deps)('payX'))._unsafeUnwrap()).toBe('ignored');
  });

  it('подписка уже есть → already (идемпотентность вебхука)', async () => {
    const { deps, saved } = makeDeps({ existing: { status: 'trialing' } as Subscription });
    expect((await confirmCardSetup(deps)('pay1'))._unsafeUnwrap()).toBe('already');
    expect(saved).toHaveLength(0);
  });

  it('холд ещё не подтверждён → pending', async () => {
    const { deps } = makeDeps({ setup: { status: 'pending', cardFingerprint: null, paymentMethodId: null } });
    expect((await confirmCardSetup(deps)('pay1'))._unsafeUnwrap()).toBe('pending');
  });

  it('карта отклонена → failed', async () => {
    const { deps } = makeDeps({ setup: { status: 'failed', cardFingerprint: null, paymentMethodId: null } });
    expect((await confirmCardSetup(deps)('pay1'))._unsafeUnwrap()).toBe('failed');
  });

  it('карта уже жгла триал → card_reused, холд снят, триал не выдан', async () => {
    const { deps, saved, releaseHold } = makeDeps({ cardUsed: true });
    expect((await confirmCardSetup(deps)('pay1'))._unsafeUnwrap()).toBe('card_reused');
    expect(saved).toHaveLength(0);
    expect(releaseHold).toHaveBeenCalledOnce();
  });

  it('успех → trial_started: carded-триал сохранён, карта в ledger, холд снят', async () => {
    const { deps, saved, markedCards, releaseHold } = makeDeps({});
    expect((await confirmCardSetup(deps)('pay1'))._unsafeUnwrap()).toBe('trial_started');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.status).toBe('trialing');
    expect(saved[0]!.paymentMethodAttached).toBe(true);
    expect(markedCards).toEqual(['fp1']);
    expect(releaseHold).toHaveBeenCalledOnce();
  });

  it('read-only подписка + списание прошло → reactivated, период активирован, без ledger-барьера', async () => {
    const expired = { orgId: 'org1', status: 'expired', planId: 'plan1', currentPeriodEnd: null, everPaid: false } as Subscription;
    const { deps, saved, markedCards, charge } = makeDeps({ existing: expired });
    expect((await confirmCardSetup(deps)('pay1'))._unsafeUnwrap()).toBe('reactivated');
    expect(charge).toHaveBeenCalledOnce();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.status).toBe('active');
    expect(saved[0]!.everPaid).toBe(true);
    expect(markedCards).toHaveLength(0); // оплата, не триал → карту в trial-ledger не пишем
  });

  it('read-only подписка + списание отклонено → reactivation_declined, подписка не меняется', async () => {
    const expired = { orgId: 'org1', status: 'expired', planId: 'plan1', currentPeriodEnd: null } as Subscription;
    const { deps, saved } = makeDeps({ existing: expired, chargeStatus: 'declined' });
    expect((await confirmCardSetup(deps)('pay1'))._unsafeUnwrap()).toBe('reactivation_declined');
    expect(saved).toHaveLength(0);
  });
});
