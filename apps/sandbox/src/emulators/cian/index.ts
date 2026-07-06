import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { createJournal } from '../../kit/journal';
import { parseFeed } from '../../kit/feed';
import { CHANNEL_SCRIPT, renderPanel } from '../../kit/panel';
import type { Emulator, EmulatorContext } from '../../kit/types';

const ACCENT = '#0468ff';

const messageTemplate = JSON.stringify(
  { chats: [{ chatId: 1, messages: [{ messageId: 'm-1', direction: 'in', createdAt: '2026-06-26T10:00:00Z', content: { text: 'Здравствуйте, ещё свободно?' } }] }] },
  null,
  2,
);

const controls = (systemBase: string) =>
  '<section class="card"><h2>1. Площадка тянет фид (pull, Циан 2.0)</h2>' +
  '<input id="feedUrl" placeholder="' + systemBase + '/api/feeds/&lt;accountId&gt;/feed.xml">' +
  '<button onclick="pull()">Забрать фид</button>' +
  '<p class="muted">После забора <code>GET /v1/get-order</code> вернёт «Published» по этим externalId → бейдж в системе позеленеет.</p></section>' +
  '<section class="card"><h2>2. Площадка шлёт сообщение (вебхук v3)</h2>' +
  '<label>Account ID (можно пусто, если подписка v3 зарегистрирована)</label><input id="acc" placeholder="id аккаунта">' +
  '<label>Сообщение</label><textarea id="msg">' + messageTemplate + '</textarea>' +
  '<button onclick="fire(\'msg\')">Отправить сообщение</button>' +
  '<p class="muted">Подписку регистрирует адаптер при подключении Циана (см. журнал: register-notifications). ' +
  'У Циана нет броней — только чаты и обратная связь по публикации.</p></section>';

const createApp = (ctx: EmulatorContext): Hono => {
  const journal = createJournal();
  let lastExternalIds: string[] = [];
  let registeredUrl = ''; // webhook-URL, зарегистрированный адаптером через v3
  const app = new Hono();

  app.get('/', (c) =>
    c.html(renderPanel({ title: 'Cian · эмулятор', accent: ACCENT, systemBase: ctx.systemBase, intro: 'XML-фид + get-order + чаты (public-api.cian.ru)', controlsHtml: controls(ctx.systemBase), script: CHANNEL_SCRIPT })),
  );
  app.get('/__journal', (c) => c.json(journal.list()));

  app.post('/__pull', async (c) => {
    const { feedUrl } = await c.req.json<{ feedUrl: string }>();
    try {
      const res = await fetch(feedUrl);
      const xml = await res.text();
      const parsed = res.ok ? parseFeed(xml) : { count: 0, titles: [], externalIds: [] };
      if (res.ok) lastExternalIds = parsed.externalIds;
      journal.add('info', 'Забрал фид (' + res.status + '): ' + parsed.count + ' объектов', parsed.externalIds.join('\n'));
      return c.json({ ok: res.ok, ...parsed });
    } catch (error) {
      journal.add('info', 'Ошибка фида', error instanceof Error ? error.message : 'fetch failed');
      return c.json({ ok: false });
    }
  });

  app.post('/__fire', async (c) => {
    const { accountId, payload } = await c.req.json<{ accountId: string; payload: unknown }>();
    // Если accountId не указан — используем URL из зарегистрированной подписки v3.
    const target = accountId ? ctx.systemBase + '/api/webhooks/cian/' + accountId : registeredUrl;
    if (!target) {
      journal.add('out', 'Вебхук не отправлен', 'нет accountId и нет зарегистрированной подписки');
      return c.json({ status: 0 });
    }
    const sent = JSON.stringify(payload);
    try {
      const res = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: sent });
      journal.add('out', 'Вебхук → система (' + res.status + ')', target + '\n' + sent);
      return c.json({ status: res.status });
    } catch (error) {
      journal.add('out', 'Вебхук → ошибка', error instanceof Error ? error.message : 'fetch failed');
      return c.json({ status: 0 });
    }
  });

  // Обратная связь по публикации: по externalId последнего фида отдаём «Published».
  app.get('/v1/get-order', (c) => {
    journal.add('in', 'GET /v1/get-order', lastExternalIds.join(', '));
    const offers = lastExternalIds.map((externalId, i) => ({
      externalId,
      offerId: 200_000_000 + i,
      status: 'Published',
      errors: [],
      warnings: [],
      url: 'https://www.cian.ru/sale/flat/' + (200_000_000 + i) + '/',
    }));
    return c.json({ operationId: randomUUID(), result: { offers } });
  });

  // Подписка на push-вебхуки v3: адаптер регистрирует наш webhook-URL на connect.
  app.post('/v3/register-notifications', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { url?: string };
    registeredUrl = body.url ?? '';
    journal.add('in', 'register-notifications (подписка ✓)', registeredUrl);
    return c.json({ operationId: randomUUID(), result: { subscribed: true } });
  });

  app.post('/v3/delete-notifications', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { url?: string };
    if (registeredUrl === body.url) registeredUrl = '';
    journal.add('in', 'delete-notifications (подписка снята)', body.url ?? '');
    return c.json({ operationId: randomUUID(), result: { unsubscribed: true } });
  });

  app.all('*', async (c) => {
    const body = await c.req.text().catch(() => '');
    journal.add('in', c.req.method + ' ' + c.req.path, body.slice(0, 600));
    return c.json({ operationId: randomUUID(), result: { ok: true } });
  });

  return app;
};

export const cianEmulator: Emulator = {
  id: 'cian',
  label: 'Cian',
  port: 4002,
  kind: 'channel',
  blurb: 'XML-фид + get-order + чаты',
  accent: ACCENT,
  createApp,
};
