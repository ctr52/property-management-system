import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import { PANEL_HTML } from './panel';

/**
 * Песочница: фейковые Avito и Cian для РУЧНОГО прогона сценариев (не автотесты).
 * Что умеет:
 *  - «площадка тянет фид»: забирает feed-URL из нашей системы и показывает листинги;
 *  - «площадка шлёт событие»: POST'ит вебхук в нашу систему (бронь/сообщение);
 *  - фейковые API-эндпоинты Avito/Cian: логируют вызовы и отдают canned-ответы.
 *
 * Реальные адаптеры в проде ходят на api.avito.ru / public-api.cian.ru; в деве —
 * на этот сервер (через env AVITO_API_BASE / CIAN_API_BASE).
 */

const SYSTEM_BASE = process.env.SYSTEM_BASE ?? 'http://localhost:3000';
const PORT = Number(process.env.FAKE_PORT ?? 4000);

type FeedPull = {
  at: string;
  feedUrl: string;
  status: number;
  count: number;
  titles: string[];
  externalIds: string[];
};
type ApiCall = { at: string; platform: string; method: string; path: string; body: string };
type FiredWebhook = { at: string; platform: string; target: string; status: number; sent: string };

const state = {
  feeds: [] as FeedPull[],
  apiCalls: [] as ApiCall[],
  webhooks: [] as FiredWebhook[],
  // externalId последнего забранного фида — основа отчёта Cian get-order.
  lastExternalIds: [] as string[],
};

const remember = <T>(list: T[], item: T) => {
  list.unshift(item);
  if (list.length > 25) list.pop();
};

const count = (xml: string, re: RegExp) => xml.match(re)?.length ?? 0;
const extractAll = (xml: string, re: RegExp) =>
  [...xml.matchAll(re)].map((m) => (m[1] ?? '').trim()).filter(Boolean);
const parseFeed = (xml: string) => ({
  count: count(xml, /<object\b/gi) + count(xml, /<Ad\b/gi),
  titles: extractAll(xml, /<Title>([\s\S]*?)<\/Title>/gi).slice(0, 20),
  externalIds: extractAll(xml, /<ExternalId>([\s\S]*?)<\/ExternalId>/gi),
});

const app = new Hono();
app.use('*', cors());

app.get('/', (c) => c.html(PANEL_HTML(SYSTEM_BASE)));

app.get('/api/state', (c) => c.json(state));

// «Площадка тянет фид» (pull-модель): забираем XML из нашей системы и парсим.
app.post('/api/pull', async (c) => {
  const { feedUrl } = await c.req.json<{ feedUrl: string }>();
  try {
    const res = await fetch(feedUrl);
    const xml = await res.text();
    const parsed = res.ok ? parseFeed(xml) : { count: 0, titles: [], externalIds: [] };
    const entry: FeedPull = { at: new Date().toISOString(), feedUrl, status: res.status, ...parsed };
    remember(state.feeds, entry);
    // Запоминаем externalId, чтобы get-order отдал по ним «опубликовано».
    if (res.ok) state.lastExternalIds = parsed.externalIds;
    return c.json(entry);
  } catch (error) {
    const entry: FeedPull = {
      at: new Date().toISOString(),
      feedUrl,
      status: 0,
      count: 0,
      titles: [`Ошибка: ${error instanceof Error ? error.message : 'fetch failed'}`],
      externalIds: [],
    };
    remember(state.feeds, entry);
    return c.json(entry, 200);
  }
});

// «Площадка шлёт событие в систему»: POST вебхука на наш бэкенд.
app.post('/api/fire-webhook', async (c) => {
  const { platform, accountId, payload } = await c.req.json<{
    platform: string;
    accountId: string;
    payload: unknown;
  }>();
  const target = `${SYSTEM_BASE}/api/webhooks/${platform}/${accountId}`;
  const sent = JSON.stringify(payload);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sent,
    });
    const entry: FiredWebhook = { at: new Date().toISOString(), platform, target, status: res.status, sent };
    remember(state.webhooks, entry);
    return c.json(entry);
  } catch (error) {
    const entry: FiredWebhook = {
      at: new Date().toISOString(),
      platform,
      target,
      status: 0,
      sent: `Ошибка: ${error instanceof Error ? error.message : 'fetch failed'}`,
    };
    remember(state.webhooks, entry);
    return c.json(entry, 200);
  }
});

// Фейковые API площадок: логируем вызов адаптера и отдаём canned-ответ.
const fakeApi = async (platform: 'avito' | 'cian', c: Context) => {
  const body = await c.req.text().catch(() => '');
  remember(state.apiCalls, {
    at: new Date().toISOString(),
    platform,
    method: c.req.method,
    path: c.req.path,
    body: body.slice(0, 500),
  });
  return c.json({ ok: true, fake: platform, operationId: randomUUID() });
};

// Cian отчёт по импорту: по externalId последнего забранного фида отдаём «Published».
// Это замыкает петлю «опубликовал → площадка забрала фид → подтверждение → бейдж позеленел».
app.get('/cian/v1/get-order', (c) => {
  remember(state.apiCalls, {
    at: new Date().toISOString(),
    platform: 'cian',
    method: 'GET',
    path: c.req.path,
    body: '',
  });
  const offers = state.lastExternalIds.map((externalId, i) => ({
    externalId,
    offerId: 200_000_000 + i,
    status: 'Published',
    errors: [],
    warnings: [],
    url: `https://www.cian.ru/sale/flat/${200_000_000 + i}/`,
  }));
  return c.json({ operationId: randomUUID(), result: { offers } });
});

app.all('/avito/*', (c) => fakeApi('avito', c));
app.all('/cian/*', (c) => fakeApi('cian', c));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`Fake channels (Avito/Cian sandbox) → http://localhost:${info.port}`);
  // eslint-disable-next-line no-console
  console.log(`Системный бэкенд: ${SYSTEM_BASE}`);
});
