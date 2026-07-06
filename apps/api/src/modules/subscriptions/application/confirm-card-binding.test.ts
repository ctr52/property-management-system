import { okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '../domain/plan';
import type { Subscription } from '../domain/subscription';
import type { BillingGateway, CardBinding } from '../ports/gateway';
import type { CardSetupIntent } from '../ports/repos';
import { confirmCardBinding, type ConfirmCardBindingDeps } from './confirm-card-binding';

const NOW = new Date('2026-06-29T00:00:00.000Z');
const PLAN: SubscriptionPlan = { id: 'plan1', name: 'Pro', priceMinor: 290000, currency: 'RUB', trialDays: 14, periodDays: 30 };
const INTENT: CardSetupIntent = { paymentId: 'pm1', orgId: 'org1', planId: 'plan1', phoneE164: '+79990000000', createdAt: NOW.toISOString() };

const makeDeps = (over: { intent?: CardSetupIntent | null; existing?: Subscription | null; binding?: CardBinding; cardUsed?: boolean }) => {
  const saved: Subscription[] = [];
  const markedCards: string[] = [];
  const intentStore = new Map<string, CardSetupIntent>();
  if (over.intent !== null) intentStore.set(INTENT.paymentId, over.intent ?? INTENT);
  const deps: ConfirmCardBindingDeps = {
    gateway: {
      bindCard: vi.fn(),
      getCardBinding: () => okAsync(over.binding ?? { status: 'active', cardFingerprint: 'fp1', paymentMethodId: 'pm1' }),
      checkoutPeriod: vi.fn(),
      getPeriodPayment: vi.fn(),
      charge: vi.fn(),
    } as unknown as BillingGateway,
    cardSetupIntents: {
      save: async (i) => void intentStore.set(i.paymentId, i),
      getByPaymentId: async (id) => intentStore.get(id) ?? null,
      consume: async (id) => void intentStore.delete(id),
    },
    subscriptions: { getByOrg: async () => over.existing ?? null, save: async (s) => void saved.push(s), listTrialingDueBy: async () => [] },
    plans: { get: async () => PLAN, list: async () => [PLAN] },
    cardLedger: { hasUsedTrial: async () => over.cardUsed ?? false, markUsed: async (fp) => void markedCards.push(fp) },
    clock: { now: () => NOW },
  };
  return { deps, saved, markedCards, intentStore };
};

describe('confirmCardBinding', () => {
  it('нет intent → ignored', async () => {
    const { deps } = makeDeps({ intent: null });
    expect((await confirmCardBinding(deps)('pmX'))._unsafeUnwrap()).toBe('ignored');
  });

  it('привязка ещё не подтверждена → pending (intent не потребляем)', async () => {
    const { deps, intentStore } = makeDeps({ binding: { status: 'pending', cardFingerprint: null, paymentMethodId: null } });
    expect((await confirmCardBinding(deps)('pm1'))._unsafeUnwrap()).toBe('pending');
    expect(intentStore.has('pm1')).toBe(true);
  });

  it('привязка не удалась → failed, intent потреблён', async () => {
    const { deps, intentStore } = makeDeps({ binding: { status: 'failed', cardFingerprint: null, paymentMethodId: null } });
    expect((await confirmCardBinding(deps)('pm1'))._unsafeUnwrap()).toBe('failed');
    expect(intentStore.has('pm1')).toBe(false);
  });

  it('карта уже жгла триал → card_reused, триал не выдан', async () => {
    const { deps, saved } = makeDeps({ cardUsed: true });
    expect((await confirmCardBinding(deps)('pm1'))._unsafeUnwrap()).toBe('card_reused');
    expect(saved).toHaveLength(0);
  });

  it('успех → trial_started: carded-триал с billingMethodRef, карта в ledger', async () => {
    const { deps, saved, markedCards } = makeDeps({});
    expect((await confirmCardBinding(deps)('pm1'))._unsafeUnwrap()).toBe('trial_started');
    expect(saved[0]!.status).toBe('trialing');
    expect(saved[0]!.paymentMethodAttached).toBe(true);
    expect(saved[0]!.billingMethodRef).toBe('pm1');
    expect(markedCards).toEqual(['fp1']);
  });

  it('повторный вебхук → ignored (intent одноразовый)', async () => {
    const { deps, saved } = makeDeps({});
    await confirmCardBinding(deps)('pm1');
    expect((await confirmCardBinding(deps)('pm1'))._unsafeUnwrap()).toBe('ignored');
    expect(saved).toHaveLength(1);
  });

  it('подписка уже есть → ignored (привязка только для новой org)', async () => {
    const { deps, saved } = makeDeps({ existing: { status: 'trialing' } as Subscription });
    expect((await confirmCardBinding(deps)('pm1'))._unsafeUnwrap()).toBe('ignored');
    expect(saved).toHaveLength(0);
  });
});
