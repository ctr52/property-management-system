import { describe, expect, it } from 'vitest';
import { canTransition, transition } from './status';
import type { Payment } from './types';

const base: Payment = {
  id: 'pay1',
  orgId: 'o1',
  reservationId: 'r1',
  legId: 'leg1',
  provider: 'manual' as Payment['provider'],
  amountMinor: 1000,
  currency: 'RUB',
  status: 'created',
  idempotencyKey: 'k',
  externalId: null,
  refundedMinor: 0,
  createdAt: 'now',
  updatedAt: 'now',
};

describe('статусная машина платежа', () => {
  it('created → pending легален', () => {
    expect(canTransition('created', 'pending')).toBe(true);
  });
  it('created → succeeded нелегален (нельзя в обход pending)', () => {
    expect(canTransition('created', 'succeeded')).toBe(false);
  });
  it('failed терминальный', () => {
    expect(canTransition('failed', 'pending')).toBe(false);
  });
  it('transition: нелегальный переход → err', () => {
    expect(transition(base, 'succeeded').isErr()).toBe(true);
  });
  it('transition: легальный переход → ok с новым статусом', () => {
    const r = transition(base, 'pending');
    expect(r.isOk()).toBe(true);
    r.map((p) => expect(p.status).toBe('pending'));
  });
  it('цепочка created → pending → succeeded проходит', () => {
    const r = transition(base, 'pending').andThen((p) => transition(p, 'succeeded'));
    expect(r.isOk()).toBe(true);
  });
});
