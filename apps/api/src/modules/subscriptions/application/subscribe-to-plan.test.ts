import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPlan } from '../domain/plan';
import type { Subscription } from '../domain/subscription';
import type { RiskLevel } from '../domain/trial-policy';
import type { BillingGateway } from '../ports/gateway';
import { subscribeToPlan, type SubscribeToPlanDeps, type SubscribeToPlanInput } from './subscribe-to-plan';

const NOW = new Date('2026-06-29T00:00:00.000Z');
const PLAN: SubscriptionPlan = {
  id: 'plan1',
  name: 'Pro',
  priceMinor: 290000,
  currency: 'RUB',
  trialDays: 14,
  periodDays: 30,
};

const baseInput: SubscribeToPlanInput = {
  planId: 'plan1',
  phoneE164: '+79990000000',
  risk: {},
  returnUrl: 'https://app.pms.ru/billing/return',
};

/** Собирает deps с управляемыми фейками; over переопределяет нужное. */
const makeDeps = (over: {
  existing?: Subscription | null;
  plan?: SubscriptionPlan | null;
  usedTrial?: boolean;
  risk?: RiskLevel;
  gateway?: BillingGateway;
  phoneVerified?: boolean;
}) => {
  const saved: Subscription[] = [];
  const marked: string[] = [];
  const intents: { paymentId: string; orgId: string }[] = [];
  const setupPaymentMethod = vi.fn<BillingGateway['setupPaymentMethod']>(() =>
    okAsync({ kind: 'redirect', url: 'https://pay/setup', externalId: 'sess1' }),
  );
  const fullGateway: BillingGateway = {
    setupPaymentMethod,
    getSetupResult: () => okAsync({ status: 'held', cardFingerprint: null, paymentMethodId: null }),
    releaseHold: () => okAsync(undefined),
    charge: () => okAsync({ status: 'succeeded' }),
  };
  const deps: SubscribeToPlanDeps = {
    plans: { get: async () => (over.plan === undefined ? PLAN : over.plan), list: async () => [PLAN] },
    subscriptions: {
      getByOrg: async () => over.existing ?? null,
      save: async (s) => void saved.push(s),
      listTrialingDueBy: async () => [],
    },
    ledger: {
      hasUsedTrial: async () => over.usedTrial ?? false,
      markUsed: async (phone) => void marked.push(phone),
    },
    riskScorer: { score: async () => over.risk ?? 'low' },
    gateway: over.gateway ?? fullGateway,
    cardSetupIntents: {
      save: async (i) => void intents.push({ paymentId: i.paymentId, orgId: i.orgId }),
      getByPaymentId: async () => null,
      consume: async () => {},
    },
    phoneVerification: { isVerified: async () => over.phoneVerified ?? true },
    clock: { now: () => NOW },
    idGen: () => 'id1',
  };
  return { deps, saved, marked, intents, setupPaymentMethod };
};

describe('subscribeToPlan', () => {
  it('чистый случай → trial_started, подписка сохранена, номер помечен', async () => {
    const { deps, saved, marked } = makeDeps({});
    const r = await subscribeToPlan(deps)('org1', baseInput);

    const outcome = r._unsafeUnwrap();
    expect(outcome.kind).toBe('trial_started');
    if (outcome.kind === 'trial_started') {
      expect(outcome.subscription.status).toBe('trialing');
      expect(outcome.subscription.trialEndsAt).toBe('2026-07-13T00:00:00.000Z');
      expect(outcome.subscription.paymentMethodAttached).toBe(false);
    }
    expect(saved).toHaveLength(1);
    expect(marked).toEqual(['+79990000000']);
  });

  it('телефон не подтверждён → rejected, ничего не сохранено и не помечено', async () => {
    const { deps, saved, marked } = makeDeps({ phoneVerified: false });
    const r = await subscribeToPlan(deps)('org1', baseInput);

    expect(r._unsafeUnwrap().kind).toBe('rejected');
    expect(saved).toHaveLength(0);
    expect(marked).toHaveLength(0);
  });

  it('номер уже жёг триал → card_required (auth-hold), intent сохранён, без выдачи триала', async () => {
    const { deps, saved, marked, intents, setupPaymentMethod } = makeDeps({ usedTrial: true });
    const r = await subscribeToPlan(deps)('org1', baseInput);

    const outcome = r._unsafeUnwrap();
    expect(outcome.kind).toBe('card_required');
    if (outcome.kind === 'card_required') expect(outcome.setup.url).toBe('https://pay/setup');
    expect(setupPaymentMethod).toHaveBeenCalledOnce();
    expect(intents).toEqual([{ paymentId: 'sess1', orgId: 'org1' }]); // отложенная привязка
    expect(saved).toHaveLength(0); // триал стартует только на подтверждении холда
    expect(marked).toHaveLength(0);
  });

  it('high risk → card_required (трение, не отказ)', async () => {
    const { deps } = makeDeps({ risk: 'high' });
    const r = await subscribeToPlan(deps)('org1', baseInput);
    expect(r._unsafeUnwrap().kind).toBe('card_required');
  });

  it('у org уже есть подписка → conflict', async () => {
    const existing = { status: 'active' } as Subscription;
    const { deps } = makeDeps({ existing });
    const r = await subscribeToPlan(deps)('org1', baseInput);
    expect(r._unsafeUnwrapErr().kind).toBe('conflict');
  });

  it('план не найден → not_found', async () => {
    const { deps } = makeDeps({ plan: null });
    const r = await subscribeToPlan(deps)('org1', baseInput);
    expect(r._unsafeUnwrapErr().kind).toBe('not_found');
  });

  it('сбой шлюза на привязке карты → validation (маппинг ошибки адаптера)', async () => {
    const gateway: BillingGateway = {
      setupPaymentMethod: () => errAsync({ code: 'gateway_error', message: 'провайдер недоступен' }),
      getSetupResult: () => okAsync({ status: 'held', cardFingerprint: null, paymentMethodId: null }),
      releaseHold: () => okAsync(undefined),
      charge: () => okAsync({ status: 'succeeded' }),
    };
    const { deps } = makeDeps({ usedTrial: true, gateway });
    const r = await subscribeToPlan(deps)('org1', baseInput);
    expect(r._unsafeUnwrapErr().kind).toBe('validation');
  });
});
