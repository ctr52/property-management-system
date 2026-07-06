import { describe, expect, it } from 'vitest';
import type { CreateReservationInput } from '@pms/shared';
import { createReservation } from './create-reservation';
import { createFakeAvailability, createFakeReservationRepo } from '../../../test-support/fakes';

const clock = { now: () => new Date('2026-06-25T00:00:00Z') };
let counter = 0;
const idGen = () => `id${(counter += 1)}`;

const input = (over: Partial<CreateReservationInput> = {}): CreateReservationInput => ({
  propertyId: 'p1',
  checkIn: '2026-07-10',
  checkOut: '2026-07-13',
  guestName: 'Гость',
  amountMinor: 500_000,
  currency: 'RUB',
  ...over,
});

describe('createReservation (direct, защита от овербукинга)', () => {
  it('свободные даты → confirmed и сохранено', async () => {
    const { port } = createFakeAvailability();
    const { repo, store } = createFakeReservationRepo();
    const run = createReservation({ reservations: repo, availability: port, idGen, clock, genToken: () => 'tok', genCode: () => '000000' });
    const r = await run('o1', input());
    expect(r.isOk()).toBe(true);
    expect(store.size).toBe(1);
    r.map((v) => expect(v.status).toBe('confirmed'));
  });

  it('пересекающиеся даты → conflict-ошибка, вторая бронь не создана', async () => {
    const { port } = createFakeAvailability();
    const { repo, store } = createFakeReservationRepo();
    const run = createReservation({ reservations: repo, availability: port, idGen, clock, genToken: () => 'tok', genCode: () => '000000' });
    await run('o1', input());
    const second = await run('o1', input({ checkIn: '2026-07-12', checkOut: '2026-07-15' }));
    expect(second.isErr()).toBe(true);
    expect(store.size).toBe(1);
  });

  it('back-to-back даты → ок (смежные не пересекаются)', async () => {
    const { port } = createFakeAvailability();
    const { repo } = createFakeReservationRepo();
    const run = createReservation({ reservations: repo, availability: port, idGen, clock, genToken: () => 'tok', genCode: () => '000000' });
    await run('o1', input());
    const next = await run('o1', input({ checkIn: '2026-07-13', checkOut: '2026-07-16' }));
    expect(next.isOk()).toBe(true);
  });

  it('несуществующий объект → ошибка', async () => {
    const { port } = createFakeAvailability(['p1']);
    const { repo, store } = createFakeReservationRepo();
    const run = createReservation({ reservations: repo, availability: port, idGen, clock, genToken: () => 'tok', genCode: () => '000000' });
    const r = await run('o1', input({ propertyId: 'nope' }));
    expect(r.isErr()).toBe(true);
    expect(store.size).toBe(0);
  });
});
