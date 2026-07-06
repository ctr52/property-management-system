import { Hono } from 'hono';
import { createHmac, randomUUID } from 'node:crypto';
import { createJournal } from '../../kit/journal';
import { parseFeed } from '../../kit/feed';
import { CHANNEL_SCRIPT, renderPanel } from '../../kit/panel';
import type { Emulator, EmulatorContext } from '../../kit/types';

const ACCENT = '#65b32e';

const messageTemplate = JSON.stringify(
  { payload: { type: 'message', value: { id: 'm-1', chat_id: 'chat-1', created: 1750000000, content: { text: 'Здравствуйте, ещё свободно?' } } } },
  null,
  2,
);
const bookingTemplate = JSON.stringify(
  {
    payload: {
      type: 'booking',
      value: { id: 'b-1', item_id: 'AV-123', date_start: '2026-07-10', date_end: '2026-07-13', guest_name: 'Пётр', amount: 1500000, currency: 'RUB' },
    },
  },
  null,
  2,
);

const controls = (systemBase: string) =>
  '<section class="card"><h2>1. Площадка тянет фид (pull)</h2>' +
  '<input id="feedUrl" placeholder="' + systemBase + '/api/feeds/&lt;accountId&gt;/feed.xml">' +
  '<button onclick="pull()">Забрать фид</button></section>' +
  '<section class="card"><h2>2. Площадка шлёт событие (вебхук)</h2>' +
  '<label>Account ID (id подключённого аккаунта)</label><input id="acc" placeholder="id аккаунта">' +
  '<label>client_secret (которым подписан вебхук — тот же, что при подключении)</label>' +
  '<input id="secret" placeholder="client_secret">' +
  '<label>Сообщение</label><textarea id="msg">' + messageTemplate + '</textarea>' +
  '<button onclick="fire(\'msg\')">Отправить сообщение</button>' +
  '<label>Бронь (item_id = привязанный Avito-листинг)</label><textarea id="booking">' + bookingTemplate + '</textarea>' +
  '<button onclick="fire(\'booking\')">Отправить бронь</button></section>';

const createApp = (ctx: EmulatorContext): Hono => {
  const journal = createJournal();
  const app = new Hono();

  app.get('/', (c) =>
    c.html(renderPanel({ title: 'Avito · эмулятор', accent: ACCENT, systemBase: ctx.systemBase, intro: 'REST + мессенджер + брони (api.avito.ru)', controlsHtml: controls(ctx.systemBase), script: CHANNEL_SCRIPT })),
  );
  app.get('/__journal', (c) => c.json(journal.list()));

  app.post('/__pull', async (c) => {
    const { feedUrl } = await c.req.json<{ feedUrl: string }>();
    try {
      const res = await fetch(feedUrl);
      const xml = await res.text();
      const parsed = res.ok ? parseFeed(xml) : { count: 0, titles: [], externalIds: [] };
      journal.add('info', 'Забрал фид (' + res.status + '): ' + parsed.count + ' объектов', parsed.titles.join('\n'));
      return c.json({ ok: res.ok, ...parsed });
    } catch (error) {
      journal.add('info', 'Ошибка фида', error instanceof Error ? error.message : 'fetch failed');
      return c.json({ ok: false });
    }
  });

  app.post('/__fire', async (c) => {
    const { accountId, secret, payload } = await c.req.json<{ accountId: string; secret?: string; payload: unknown }>();
    const target = ctx.systemBase + '/api/webhooks/avito/' + accountId;
    const sent = JSON.stringify(payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // Подписываем тело тем же client_secret, что введён при подключении (HMAC-SHA256).
    if (secret) headers['x-avito-messenger-signature'] = createHmac('sha256', secret).update(sent, 'utf8').digest('hex');
    try {
      const res = await fetch(target, { method: 'POST', headers, body: sent });
      journal.add('out', 'Вебхук → система (' + res.status + ')', target + '\n' + sent);
      return c.json({ status: res.status });
    } catch (error) {
      journal.add('out', 'Вебхук → ошибка', error instanceof Error ? error.message : 'fetch failed');
      return c.json({ status: 0 });
    }
  });

  // OAuth client_credentials — отдаём фейковый токен.
  app.post('/token', (c) => {
    journal.add('in', 'POST /token (OAuth)');
    return c.json({ access_token: 'fake-avito-token', token_type: 'Bearer', expires_in: 3600 });
  });

  // Любой другой вызов адаптера (цены/брони/сообщения) — логируем и отдаём canned-ответ.
  app.all('*', async (c) => {
    const body = await c.req.text().catch(() => '');
    journal.add('in', c.req.method + ' ' + c.req.path, body.slice(0, 600));
    return c.json({ ok: true, operationId: randomUUID() });
  });

  return app;
};

export const avitoEmulator: Emulator = {
  id: 'avito',
  label: 'Avito',
  port: 4001,
  kind: 'channel',
  blurb: 'REST + мессенджер + брони',
  accent: ACCENT,
  createApp,
};
