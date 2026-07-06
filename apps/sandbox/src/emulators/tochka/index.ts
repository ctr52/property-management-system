import { Hono } from 'hono';
import { createHmac, randomUUID } from 'node:crypto';
import { createJournal } from '../../kit/journal';
import { renderPanel } from '../../kit/panel';
import type { Emulator, EmulatorContext } from '../../kit/types';

const ACCENT = '#5b2be0';
const SELF = 'http://localhost:4011';

const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Подписанный HS256 JWT (как «вебхук» Точки в песочнице). */
const signJwt = (claims: Record<string, unknown>, secret: string): string => {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
};

type Operation = { apiToken: string; accountId: string; amount: number; purpose: string; redirectUrl: string };

const infoControls =
  '<section class="card"><h2>Как это работает</h2>' +
  '<p>Эмулятор перехватывает <code>Bearer</code>-токен на создании платежа и им же подписывает ' +
  'JWT-вебхук — поэтому отдельный тестовый секрет НЕ нужен: подключай Точку в системе с ' +
  '<b>любым</b> API-токеном и Customer Code.</p>' +
  '<p class="muted">Боевая Точка подписывает вебхук RS256 по ключу банка — в проде заменить verify.</p></section>' +
  '<section class="card"><h2>Как проверить</h2><ol>' +
  '<li>Подключи провайдера <code>tochka</code> (Customer Code + любой API-токен).</li>' +
  '<li>Создай план с provider-ногой <code>tochka</code> и вызови <code>POST /api/payments/init</code>.</li>' +
  '<li>Адаптер сделает реальный <code>POST /acquiring/v1.0/payments</code> сюда → paymentLink приведёт на страницу оплаты.</li></ol></section>';

const createApp = (ctx: EmulatorContext): Hono => {
  const journal = createJournal();
  const ops = new Map<string, Operation>();
  const app = new Hono();

  app.get('/', (c) =>
    c.html(renderPanel({ title: 'Точка Банк · эмулятор', accent: ACCENT, systemBase: ctx.systemBase, intro: 'REST create-payment + JWT-вебхук', controlsHtml: infoControls })),
  );
  app.get('/__journal', (c) => c.json(journal.list()));

  // Адаптер создаёт платёж (реальный REST-вызов).
  app.post('/acquiring/v1.0/payments', async (c) => {
    const auth = c.req.header('authorization') ?? '';
    const apiToken = auth.replace(/^Bearer\s+/i, '');
    const body = (await c.req.json().catch(() => ({}))) as { Data?: Record<string, unknown> };
    const data = body.Data ?? {};
    const operationId = randomUUID();
    ops.set(operationId, {
      apiToken,
      accountId: String(data.accountRef ?? ''),
      amount: Number(data.amount ?? 0),
      purpose: String(data.purpose ?? ''),
      redirectUrl: String(data.redirectUrl ?? ''),
    });
    const paymentLink = `${SELF}/pay?operationId=${operationId}`;
    journal.add('in', 'create-payment → operationId ' + operationId.slice(0, 8), 'amount=' + String(data.amount) + ' acc=' + String(data.accountRef));
    return c.json({ Data: { operationId, paymentLink } });
  });

  // Страница оплаты (цель paymentLink).
  app.get('/pay', (c) => {
    const operationId = c.req.query('operationId') ?? '';
    const op = ops.get(operationId);
    if (!op) return c.html(renderPanel({ title: 'Точка · оплата', accent: ACCENT, systemBase: ctx.systemBase, intro: 'Оплата', controlsHtml: '<section class="card"><p>Операция не найдена.</p></section>' }));

    const controls =
      '<section class="card"><h2>Оплата заказа</h2>' +
      '<p>Назначение: <b>' + op.purpose + '</b></p>' +
      '<p>Сумма: <b>' + op.amount + ' ₽</b></p>' +
      '<button onclick="payNow()">Оплатить (APPROVED)</button> ' +
      '<button onclick="decline()" style="background:#b91c1c">Отклонить (REJECTED)</button>' +
      '<p id="status" class="muted"></p></section>';
    const script =
      'var OP = ' + JSON.stringify({ operationId, redirectUrl: op.redirectUrl }) + ';' +
      'function send(st){ post("/__pay", { operationId: OP.operationId, status: st }).then(function(r){ document.getElementById("status").textContent = "Вебхук отправлен ("+st+"), HTTP " + (r.status||"?") + ". Возврат…"; if (OP.redirectUrl) setTimeout(function(){ window.location = OP.redirectUrl; }, 1200); }); }' +
      'window.payNow = function(){ send("APPROVED"); };' +
      'window.decline = function(){ send("REJECTED"); };';
    return c.html(renderPanel({ title: 'Точка · оплата', accent: ACCENT, systemBase: ctx.systemBase, intro: 'Тестовая страница оплаты', controlsHtml: controls, script }));
  });

  // Кнопка оплаты → подписываем JWT тем же apiToken и шлём вебхук в систему.
  app.post('/__pay', async (c) => {
    const { operationId, status } = await c.req.json<{ operationId: string; status: string }>();
    const op = ops.get(operationId);
    if (!op) return c.json({ status: 0, error: 'unknown operation' });
    const jwt = signJwt({ operationId, status, amount: op.amount }, op.apiToken);
    const target = ctx.systemBase + '/api/payment-webhooks/tochka/' + op.accountId;
    try {
      const res = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/jwt' }, body: jwt });
      journal.add('out', 'JWT-вебхук → система (HTTP ' + res.status + ')', status + ' → ' + target);
      return c.json({ status: res.status });
    } catch (error) {
      journal.add('out', 'Вебхук → ошибка', error instanceof Error ? error.message : 'fetch failed');
      return c.json({ status: 0 });
    }
  });

  return app;
};

export const tochkaEmulator: Emulator = {
  id: 'tochka',
  label: 'Точка Банк',
  port: 4011,
  kind: 'payment',
  blurb: 'REST create + JWT-вебхук',
  accent: ACCENT,
  createApp,
};
