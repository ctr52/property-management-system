import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { every } from 'hono/combine';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../../app-env';
import { beginTrial, lapseTrial, type Subscription } from '../domain/subscription';
import { createReadOnlyGate, type ReadSubscription } from './read-only-gate';

const NOW = '2026-06-29T00:00:00.000Z';

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  ...beginTrial({ orgId: 'org1', planId: 'plan1', trialDays: 14, now: NOW, withCard: false })._unsafeUnwrap(),
  ...over,
});

/** requireAuth-заглушка: кладёт фиксированный auth (как в проде гейт идёт после неё). */
const fakeAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('auth', { userId: 'u1', orgId: 'org1', email: 'a@b.c', role: 'owner' });
  await next();
};

/** Мини-приложение: один read-роут и один write-роут под `every(auth, gate)`. */
const appWith = (read: ReadSubscription) =>
  new Hono<AppEnv>()
    .use('*', every(fakeAuth, createReadOnlyGate(read)))
    .get('/x', (c) => c.json({ ok: true }))
    .post('/x', (c) => c.json({ created: true }, 201));

describe('createReadOnlyGate', () => {
  it('write при expired → 403 subscription_read_only', async () => {
    const app = appWith(async () => lapseTrial(sub())._unsafeUnwrap());
    const res = await app.request('/x', { method: 'POST' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe('subscription_read_only');
  });

  it('write при canceled → 403', async () => {
    const app = appWith(async () => sub({ status: 'canceled' }));
    const res = await app.request('/x', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('write при trialing → проходит', async () => {
    const app = appWith(async () => sub());
    const res = await app.request('/x', { method: 'POST' });
    expect(res.status).toBe(201);
  });

  it('write при active → проходит', async () => {
    const app = appWith(async () => sub({ status: 'active', everPaid: true }));
    const res = await app.request('/x', { method: 'POST' });
    expect(res.status).toBe(201);
  });

  it('read (GET) при expired → проходит, подписку даже не читает', async () => {
    let called = false;
    const app = appWith(async () => {
      called = true;
      return lapseTrial(sub())._unsafeUnwrap();
    });
    const res = await app.request('/x');
    expect(res.status).toBe(200);
    expect(called).toBe(false);
  });

  it('нет подписки (null) → fail-open, write проходит', async () => {
    const app = appWith(async () => null);
    const res = await app.request('/x', { method: 'POST' });
    expect(res.status).toBe(201);
  });
});
