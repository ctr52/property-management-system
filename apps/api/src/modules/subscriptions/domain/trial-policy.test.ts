import { describe, expect, it } from 'vitest';
import { decideTrialPolicy, type TrialSignals } from './trial-policy';

const base: TrialSignals = { phoneVerified: true, phoneUsedTrialBefore: false, risk: 'low' };

describe('decideTrialPolicy', () => {
  it('телефон не подтверждён → reject (даже при чистых остальных сигналах)', () => {
    expect(decideTrialPolicy({ ...base, phoneVerified: false }).kind).toBe('reject');
  });

  it('номер уже жёг триал → require_card_first', () => {
    expect(decideTrialPolicy({ ...base, phoneUsedTrialBefore: true }).kind).toBe('require_card_first');
  });

  it('high risk → require_card_first (трение, не отказ)', () => {
    expect(decideTrialPolicy({ ...base, risk: 'high' }).kind).toBe('require_card_first');
  });

  it('medium risk сам по себе не повышает трение → grant_trial', () => {
    expect(decideTrialPolicy({ ...base, risk: 'medium' }).kind).toBe('grant_trial');
  });

  it('подтверждён, не жёг, low risk → grant_trial', () => {
    expect(decideTrialPolicy(base)).toEqual({ kind: 'grant_trial' });
  });

  it('приоритет: нет телефона важнее использованного триала', () => {
    expect(decideTrialPolicy({ phoneVerified: false, phoneUsedTrialBefore: true, risk: 'high' }).kind).toBe('reject');
  });
});
