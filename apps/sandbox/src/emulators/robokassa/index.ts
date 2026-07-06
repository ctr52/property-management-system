import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { createJournal } from '../../kit/journal';
import { renderPanel } from '../../kit/panel';
import type { Emulator, EmulatorContext } from '../../kit/types';

const ACCENT = '#1a8917';

// Тестовые реквизиты песочницы. Подключи Robokassa в системе с ними — тогда подписи совпадут.
const MERCHANT = 'pms-demo';
const PASSWORD1 = 'sbpass1';
const PASSWORD2 = 'sbpass2';

const md5 = (input: string): string => createHash('md5').update(input, 'utf8').digest('hex').toLowerCase();

const infoControls =
  '<section class="card"><h2>Тестовые реквизиты</h2>' +
  '<p>Подключи Robokassa в системе (Платежи → Подключить) с этими данными:</p>' +
  '<pre>MerchantLogin: ' + MERCHANT + '\nПароль #1: ' + PASSWORD1 + '\nПароль #2: ' + PASSWORD2 + '</pre>' +
  '<p class="muted">Эмулятор подписывает ResultURL этим Password#2 — он должен совпасть с тем, что в системе.</p></section>' +
  '<section class="card"><h2>Как проверить</h2><ol>' +
  '<li>Подключи Robokassa (реквизиты выше).</li>' +
  '<li>Создай план оплаты брони с provider-ногой <code>robokassa</code> и вызови <code>POST /api/payments/init</code>.</li>' +
  '<li>redirectUrl приведёт сюда на страницу оплаты — нажми «Оплатить».</li></ol></section>';

const createApp = (ctx: EmulatorContext): Hono => {
  const journal = createJournal();
  const app = new Hono();

  app.get('/', (c) =>
    c.html(renderPanel({ title: 'Robokassa · эмулятор', accent: ACCENT, systemBase: ctx.systemBase, intro: 'redirect Index.aspx + ResultURL (MD5)', controlsHtml: infoControls })),
  );
  app.get('/__journal', (c) => c.json(journal.list()));

  // Страница оплаты (цель редиректа из адаптера).
  app.get('/Merchant/Index.aspx', (c) => {
    const q = c.req.query();
    const login = q.MerchantLogin ?? '';
    const outSum = q.OutSum ?? '';
    const invId = q.InvId ?? '';
    const desc = q.Description ?? '';
    const shpAcc = q.Shp_acc ?? '';
    const successUrl = q.SuccessUrl ?? '';
    const provided = (q.SignatureValue ?? '').toLowerCase();
    const expected = md5(`${login}:${outSum}:${invId}:${PASSWORD1}:Shp_acc=${shpAcc}`);
    const sigOk = provided === expected;
    journal.add('in', 'Redirect Index.aspx (InvId ' + invId + ')', 'OutSum=' + outSum + ' подпись ' + (sigOk ? 'OK' : 'BAD'));

    const controls =
      '<section class="card"><h2>Оплата заказа</h2>' +
      '<p>Назначение: <b>' + desc + '</b></p>' +
      '<p>Сумма: <b>' + outSum + ' ₽</b> · InvId: ' + invId + '</p>' +
      '<p class="muted">Подпись инициации: ' + (sigOk ? '✓ верна' : '✗ НЕ совпала (проверь Password#1)') + '</p>' +
      '<button onclick="payNow()">Оплатить</button> ' +
      '<button onclick="decline()" style="background:#b91c1c">Отклонить</button>' +
      '<p id="status" class="muted"></p></section>';

    const script =
      'var PAY = ' + JSON.stringify({ invId, outSum, shpAcc, successUrl }) + ';' +
      'window.payNow = function(){ post("/__pay", PAY).then(function(r){ document.getElementById("status").textContent = "Оплачено, ResultURL отправлен (HTTP " + (r.status||"?") + "). Возврат…"; if (PAY.successUrl) setTimeout(function(){ window.location = PAY.successUrl; }, 1200); }); };' +
      'window.decline = function(){ document.getElementById("status").textContent = "Отклонено. Robokassa шлёт ResultURL только при успехе — вебхук НЕ отправлен."; };';

    return c.html(renderPanel({ title: 'Robokassa · оплата', accent: ACCENT, systemBase: ctx.systemBase, intro: 'Тестовая страница оплаты', controlsHtml: controls, script }));
  });

  // Кнопка «Оплатить» → подписываем ResultURL Password#2 и шлём в систему (form-urlencoded).
  app.post('/__pay', async (c) => {
    const { invId, outSum, shpAcc } = await c.req.json<{ invId: string; outSum: string; shpAcc: string }>();
    const signature = md5(`${outSum}:${invId}:${PASSWORD2}:Shp_acc=${shpAcc}`);
    const body = new URLSearchParams({ OutSum: outSum, InvId: invId, SignatureValue: signature, Shp_acc: shpAcc }).toString();
    const target = ctx.systemBase + '/api/payment-webhooks/robokassa/' + shpAcc;
    try {
      const res = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      journal.add('out', 'ResultURL → система (HTTP ' + res.status + ')', target + '\n' + body);
      return c.json({ status: res.status });
    } catch (error) {
      journal.add('out', 'ResultURL → ошибка', error instanceof Error ? error.message : 'fetch failed');
      return c.json({ status: 0 });
    }
  });

  return app;
};

export const robokassaEmulator: Emulator = {
  id: 'robokassa',
  label: 'Robokassa',
  port: 4010,
  kind: 'payment',
  blurb: 'redirect + ResultURL (MD5)',
  accent: ACCENT,
  createApp,
};
