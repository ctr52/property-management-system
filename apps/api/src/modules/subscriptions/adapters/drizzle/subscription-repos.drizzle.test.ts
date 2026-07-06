import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../../../db/client';
import * as schema from '../../../../db/schema';
import { beginTrial, lapseTrial } from '../../domain/subscription';
import {
  createDrizzleCardLedger,
  createDrizzleCardSetupIntentRepo,
  createDrizzleSubscriptionRepo,
  createDrizzleTrialEligibilityLedger,
} from './subscription-repos.drizzle';

/**
 * Единственный тест, трогающий БД: на in-memory PGlite проверяем, что рукописная миграция 0004
 * применяется и drizzle-адаптеры подписок делают round-trip. Остальные тесты — на чистых фейках.
 */
const here = dirname(fileURLToPath(import.meta.url));
const ORG = '00000000-0000-0000-0000-000000000001';

let db: Db;

beforeAll(async () => {
  const client = new PGlite(); // in-memory
  db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db, { migrationsFolder: resolve(here, '../../../../../drizzle') });
});

describe('drizzle subscription repos (PGlite)', () => {
  it('subscription: save → getByOrg round-trip (trialing, trialEndsAt сохраняется)', async () => {
    const repo = createDrizzleSubscriptionRepo(db);
    const sub = beginTrial({ orgId: ORG, planId: 'pro', trialDays: 14, now: '2026-06-29T00:00:00.000Z', withCard: false })._unsafeUnwrap();
    await repo.save(sub);

    const loaded = await repo.getByOrg(ORG);
    expect(loaded).toEqual(sub);
  });

  it('subscription: upsert по orgId (повторный save перетирает)', async () => {
    const repo = createDrizzleSubscriptionRepo(db);
    const sub = beginTrial({ orgId: ORG, planId: 'pro', trialDays: 14, now: '2026-06-29T00:00:00.000Z', withCard: false })._unsafeUnwrap();
    await repo.save(sub);
    await repo.save(lapseTrial(sub)._unsafeUnwrap());

    const loaded = await repo.getByOrg(ORG);
    expect(loaded?.status).toBe('expired');
    expect(loaded?.trialEndsAt).toBeNull();
  });

  it('trial ledger: markUsed идемпотентен по номеру', async () => {
    const ledger = createDrizzleTrialEligibilityLedger(db);
    expect(await ledger.hasUsedTrial('+79990000001')).toBe(false);
    await ledger.markUsed('+79990000001', ORG, '2026-06-29T00:00:00.000Z');
    await ledger.markUsed('+79990000001', ORG, '2026-06-30T00:00:00.000Z'); // не падает
    expect(await ledger.hasUsedTrial('+79990000001')).toBe(true);
  });

  it('card ledger: одна карта = один триал', async () => {
    const ledger = createDrizzleCardLedger(db);
    expect(await ledger.hasUsedTrial('fp-xyz')).toBe(false);
    await ledger.markUsed('fp-xyz', ORG, '2026-06-29T00:00:00.000Z');
    expect(await ledger.hasUsedTrial('fp-xyz')).toBe(true);
  });

  it('card setup intent: save → getByPaymentId', async () => {
    const repo = createDrizzleCardSetupIntentRepo(db);
    const intent = { paymentId: 'pay-77', orgId: ORG, planId: 'pro', phoneE164: '+79990000002', createdAt: '2026-06-29T00:00:00.000Z' };
    await repo.save(intent);
    expect(await repo.getByPaymentId('pay-77')).toEqual(intent);
    expect(await repo.getByPaymentId('nope')).toBeNull();
  });
});
