import { describe, expect, it } from 'vitest';
import {
  type AccountBindingRecord,
  decideAccountBinding,
  decideDetach,
  type ExternalAccountIdentity,
} from './account-binding';

const identity: ExternalAccountIdentity = { platform: 'avito', externalAccountId: 'AV-777' };

describe('decideAccountBinding (анти-абьюз привязки)', () => {
  it('свободный внешний аккаунт → bind', () => {
    const d = decideAccountBinding({ requestingOrgId: 'o1', identity, existing: null });
    expect(d.kind).toBe('bind');
  });

  it('аккаунт уже за этой же org → bind (идемпотентно)', () => {
    const existing: AccountBindingRecord = { ...identity, orgId: 'o1' };
    const d = decideAccountBinding({ requestingOrgId: 'o1', identity, existing });
    expect(d.kind).toBe('bind');
  });

  it('аккаунт за другой org → conflict с указанием владельца', () => {
    const existing: AccountBindingRecord = { ...identity, orgId: 'o-other' };
    const d = decideAccountBinding({ requestingOrgId: 'o1', identity, existing });
    expect(d).toEqual({ kind: 'conflict', ownedByOrgId: 'o-other' });
  });
});

describe('decideDetach (замок на неоплаченном триале)', () => {
  it('триал не оплачен → locked', () => {
    expect(decideDetach({ trialUnpaid: true }).kind).toBe('locked');
  });
  it('подписка оплачена → allow', () => {
    expect(decideDetach({ trialUnpaid: false })).toEqual({ kind: 'allow' });
  });
});
