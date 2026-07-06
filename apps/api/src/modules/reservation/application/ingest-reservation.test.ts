import { describe, expect, it } from 'vitest';
import { ingestReservation, type IngestReservationInput } from './ingest-reservation';
import { createFakeAvailability, createFakeReservationRepo } from '../../../test-support/fakes';
import type { ListingResolver } from '../ports/listing-resolver';

const clock = { now: () => new Date('2026-06-25T00:00:00Z') };
let counter = 0;
const idGen = () => `rid${(counter += 1)}`;

const resolver = (map: Record<string, string>): ListingResolver => ({
  propertyIdFor: async (_orgId, _source, externalListingId) => map[externalListingId] ?? null,
});

const mkDeps = (map: Record<string, string>) => {
  // Те же часы, что и у use-case, — иначе фейк оценит tentative-холд как протухший.
  const a = createFakeAvailability(['p1'], () => clock.now().toISOString());
  const r = createFakeReservationRepo();
  const run = ingestReservation({
    reservations: r.repo,
    availability: a.port,
    listings: resolver(map),
    idGen,
    clock,
    tentativeTtlMs: 900_000,
    genToken: () => `tok${(counter += 1)}`,
    genCode: () => '000000',
  });
  return { run, store: r.store, holds: a.holds };
};

const input = (over: Partial<IngestReservationInput> = {}): IngestReservationInput => ({
  source: 'avito',
  externalId: 'B1',
  externalListingId: 'AV-1',
  checkIn: '2026-07-10',
  checkOut: '2026-07-13',
  guestName: 'Пётр',
  amountMinor: 500_000,
  currency: 'RUB',
  status: 'confirmed',
  ...over,
});

describe('ingestReservation (inbound с площадки)', () => {
  it('неизвестный листинг → тихо игнорируем, ничего не сохранено', async () => {
    const { run, store } = mkDeps({});
    const r = await run('o1', input());
    expect(r.isOk()).toBe(true);
    expect(store.size).toBe(0);
  });

  it('confirmed, свободно → confirmed (firm)', async () => {
    const { run, store, holds } = mkDeps({ 'AV-1': 'p1' });
    await run('o1', input());
    expect(store.size).toBe(1);
    expect([...store.values()][0]?.status).toBe('confirmed');
    expect([...holds.values()][0]?.tier).toBe('firm');
  });

  it("заявка 'new' → pending (tentative hold с TTL)", async () => {
    const { run, store, holds } = mkDeps({ 'AV-1': 'p1' });
    await run('o1', input({ status: 'new' }));
    expect([...store.values()][0]?.status).toBe('pending');
    const hold = [...holds.values()][0];
    expect(hold?.tier).toBe('tentative');
    expect(hold?.expiresAt).not.toBe(null);
  });

  it('повтор того же externalId → идемпотентно (одна бронь)', async () => {
    const { run, store } = mkDeps({ 'AV-1': 'p1' });
    await run('o1', input());
    await run('o1', input());
    expect(store.size).toBe(1);
  });

  it('занято firm (овербукинг между каналами) → conflict без hold', async () => {
    const { run, store, holds } = mkDeps({ 'AV-1': 'p1' });
    await run('o1', input()); // firm
    await run('o1', input({ externalId: 'B2', checkIn: '2026-07-12', checkOut: '2026-07-15' }));
    const conflict = [...store.values()].find((r) => r.externalId === 'B2');
    expect(conflict?.status).toBe('conflict');
    expect(conflict?.holdId).toBe(null);
    expect(holds.size).toBe(1);
  });

  it('confirmed вытесняет пересекающийся tentative (оплата бьёт неоплату)', async () => {
    const { run, store, holds } = mkDeps({ 'AV-1': 'p1' });
    await run('o1', input({ externalId: 'B1', status: 'new' })); // tentative pending
    await run('o1', input({ externalId: 'B2', status: 'confirmed', checkIn: '2026-07-12', checkOut: '2026-07-15' }));
    const tentative = [...store.values()].find((r) => r.externalId === 'B1');
    const firm = [...store.values()].find((r) => r.externalId === 'B2');
    expect(tentative?.status).toBe('preempted');
    expect(firm?.status).toBe('confirmed');
    expect(holds.size).toBe(1); // tentative вытеснен, остался firm
  });

  it("'cancelled' → отменяет существующую бронь и освобождает даты", async () => {
    const { run, store, holds } = mkDeps({ 'AV-1': 'p1' });
    await run('o1', input({ status: 'confirmed' }));
    await run('o1', input({ status: 'cancelled' }));
    expect([...store.values()][0]?.status).toBe('cancelled');
    expect(holds.size).toBe(0);
  });
});
