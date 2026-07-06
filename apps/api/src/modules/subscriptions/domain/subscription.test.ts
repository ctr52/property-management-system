import { describe, expect, it } from 'vitest';
import {
  activate,
  attachPaymentMethod,
  beginTrial,
  cancel,
  decideTrialExpiry,
  isReadOnly,
  isTrialUnpaid,
  lapseTrial,
  MAX_TRIAL_DAYS,
  type Subscription,
} from './subscription';

const NOW = '2026-06-29T00:00:00.000Z';

/** Удобный конструктор валидного триала для тестов переходов. */
const trial = (over: Partial<Subscription> = {}): Subscription => {
  const sub = beginTrial({ orgId: 'org1', planId: 'plan1', trialDays: 14, now: NOW, withCard: false });
  return { ...sub._unsafeUnwrap(), ...over };
};

describe('beginTrial', () => {
  it('валидный триал → trialing, trialEndsAt = now + trialDays, ничего не оплачено', () => {
    const sub = beginTrial({ orgId: 'org1', planId: 'plan1', trialDays: 14, now: NOW, withCard: false })._unsafeUnwrap();
    expect(sub.status).toBe('trialing');
    expect(sub.trialEndsAt).toBe('2026-07-13T00:00:00.000Z');
    expect(sub.everPaid).toBe(false);
    expect(sub.paymentMethodAttached).toBe(false);
  });

  it('withCard=true (require_card_first) → карта на файле, но триал ещё бесплатный', () => {
    const sub = beginTrial({ orgId: 'org1', planId: 'plan1', trialDays: 14, now: NOW, withCard: true })._unsafeUnwrap();
    expect(sub.paymentMethodAttached).toBe(true);
    expect(sub.status).toBe('trialing');
    expect(sub.everPaid).toBe(false);
  });

  it.each([0, -1, 3.5, MAX_TRIAL_DAYS + 1])('невалидная длина (%s) → err invalid_trial_days', (days) => {
    const r = beginTrial({ orgId: 'org1', planId: 'plan1', trialDays: days, now: NOW, withCard: false });
    expect(r._unsafeUnwrapErr().code).toBe('invalid_trial_days');
  });
});

describe('decideTrialExpiry', () => {
  it('ещё не истёк → not_yet', () => {
    expect(decideTrialExpiry(trial(), '2026-07-01T00:00:00.000Z').kind).toBe('not_yet');
  });

  it('истёк, нет карты → lapse', () => {
    expect(decideTrialExpiry(trial(), '2026-08-01T00:00:00.000Z').kind).toBe('lapse');
  });

  it('истёк, есть карта → attempt_renewal (автобиллинг)', () => {
    expect(decideTrialExpiry(trial({ paymentMethodAttached: true }), '2026-08-01T00:00:00.000Z').kind).toBe(
      'attempt_renewal',
    );
  });

  it('не trialing → noop', () => {
    expect(decideTrialExpiry(trial({ status: 'active' }), '2026-08-01T00:00:00.000Z').kind).toBe('noop');
  });
});

describe('lapseTrial', () => {
  it('trialing → expired (read-only, не оплачено)', () => {
    const sub = lapseTrial(trial())._unsafeUnwrap();
    expect(sub.status).toBe('expired');
    expect(sub.trialEndsAt).toBeNull();
    expect(isReadOnly(sub)).toBe(true);
    expect(isTrialUnpaid(sub)).toBe(true);
  });

  it('не из trialing → invalid_transition', () => {
    expect(lapseTrial(trial({ status: 'active' }))._unsafeUnwrapErr().code).toBe('invalid_transition');
  });
});

describe('activate', () => {
  it('из trialing → active, everPaid, currentPeriodEnd = now + period', () => {
    const sub = activate(trial(), { now: NOW, periodDays: 30 })._unsafeUnwrap();
    expect(sub.status).toBe('active');
    expect(sub.everPaid).toBe(true);
    expect(sub.trialEndsAt).toBeNull();
    expect(sub.currentPeriodEnd).toBe('2026-07-29T00:00:00.000Z');
    expect(isReadOnly(sub)).toBe(false);
    expect(isTrialUnpaid(sub)).toBe(false);
  });

  it('из expired (оплата после лапса) снимает read-only и замок отвязки', () => {
    const expired = lapseTrial(trial())._unsafeUnwrap();
    const sub = activate(expired, { now: NOW, periodDays: 30 })._unsafeUnwrap();
    expect(sub.status).toBe('active');
    expect(isTrialUnpaid(sub)).toBe(false);
  });

  it('повторно из active → invalid_transition', () => {
    const active = activate(trial(), { now: NOW, periodDays: 30 })._unsafeUnwrap();
    expect(activate(active, { now: NOW, periodDays: 30 })._unsafeUnwrapErr().code).toBe('invalid_transition');
  });
});

describe('cancel', () => {
  it('active → canceled (read-only, но платил → отвязка аккаунтов разрешена)', () => {
    const active = activate(trial(), { now: NOW, periodDays: 30 })._unsafeUnwrap();
    const sub = cancel(active)._unsafeUnwrap();
    expect(sub.status).toBe('canceled');
    expect(isReadOnly(sub)).toBe(true);
    expect(isTrialUnpaid(sub)).toBe(false);
  });

  it('нельзя отменить не активную → invalid_transition', () => {
    expect(cancel(trial())._unsafeUnwrapErr().code).toBe('invalid_transition');
  });
});

describe('attachPaymentMethod', () => {
  it('ставит флаг + ref и идемпотентна', () => {
    const once = attachPaymentMethod(trial(), 'pm_ref');
    expect(once.paymentMethodAttached).toBe(true);
    expect(once.billingMethodRef).toBe('pm_ref');
    expect(attachPaymentMethod(once, 'pm_ref')).toBe(once);
  });
});
