/** HTML панели управления песочницей. Без сборки — vanilla JS + fetch. */
export const PANEL_HTML = (systemBase: string): string => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Fake Avito / Cian — песочница</title>
<style>
  :root { font-family: system-ui, sans-serif; color: #1a1a1a; }
  body { margin: 0; padding: 24px; max-width: 920px; margin: 0 auto; }
  h1 { font-size: 22px; }
  h2 { font-size: 16px; margin-top: 28px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
  label { display: block; font-size: 13px; color: #6b7280; margin: 8px 0 4px; }
  input, select, textarea, button { font: inherit; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; }
  input, select, textarea { width: 100%; box-sizing: border-box; }
  textarea { min-height: 96px; font-family: ui-monospace, monospace; font-size: 13px; }
  button { background: #1a1a1a; color: #fff; border-color: #1a1a1a; cursor: pointer; margin-top: 8px; }
  .muted { color: #6b7280; font-size: 13px; }
  .log { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 8px 10px; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; }
  .row { display: flex; gap: 12px; }
  .row > * { flex: 1; }
  .ok { color: #16a34a; } .bad { color: #b91c1c; }
</style>
</head>
<body>
  <h1>🧪 Fake Avito / Cian — песочница</h1>
  <p class="muted">Системный бэкенд: <code>${systemBase}</code></p>

  <h2>1. Площадка тянет фид (pull)</h2>
  <div class="card">
    <p class="muted">Вставь feed-URL из раздела «Площадки» (сначала нажми там «Опубликовать фид»).</p>
    <label>Feed URL</label>
    <input id="feedUrl" placeholder="${systemBase}/api/feeds/&lt;accountId&gt;/feed.xml" />
    <button onclick="pull()">Забрать фид</button>
    <div id="pullResult" class="muted"></div>
  </div>

  <h2>2. Площадка шлёт событие в систему (вебхук)</h2>
  <div class="card">
    <div class="row">
      <div>
        <label>Площадка</label>
        <select id="platform" onchange="fillTemplate()"><option value="avito">avito</option><option value="cian">cian</option></select>
      </div>
      <div>
        <label>Тип</label>
        <select id="evtType" onchange="fillTemplate()"><option value="message">Сообщение</option><option value="booking">Бронь (Avito)</option></select>
      </div>
      <div>
        <label>Account ID (id из feed-URL)</label>
        <input id="accountId" placeholder="id подключённого аккаунта" />
      </div>
    </div>
    <p class="muted">Бронь: <code>item_id</code> = id привязанного Avito-объявления (напр. AV-123).</p>
    <label>Payload вебхука (JSON)</label>
    <textarea id="payload"></textarea>
    <button onclick="fire()">Отправить вебхук в систему</button>
    <div id="fireResult" class="muted"></div>
  </div>

  <h2>Журнал</h2>
  <div class="card">
    <strong>Заборы фида</strong><div id="feeds" class="log"></div>
    <strong>Вызовы API площадки (от наших адаптеров)</strong><div id="apiCalls" class="log"></div>
    <strong>Отправленные вебхуки</strong><div id="webhooks" class="log"></div>
  </div>

<script>
  const nowUnix = () => Math.floor(Date.now() / 1000);
  const bookingPayload = () => ({ payload: { type: "booking", value: { id: "b-" + Date.now(), item_id: "AV-123", date_start: "2026-07-10", date_end: "2026-07-13", guest_name: "Пётр", amount: 1500000, currency: "RUB" } } });
  const templates = {
    message: {
      avito: () => ({ payload: { type: "message", value: { id: "m-" + Date.now(), chat_id: "chat-1", created: nowUnix(), content: { text: "Здравствуйте, ещё свободно?" } } } }),
      cian: () => ({ chats: [ { chatId: 1, messages: [ { messageId: "m-" + Date.now(), direction: "in", createdAt: new Date().toISOString(), content: { text: "Здравствуйте, ещё свободно?" } } ] } ] })
    },
    booking: { avito: bookingPayload, cian: bookingPayload }
  };
  function fillTemplate() {
    const p = document.getElementById('platform').value;
    const t = document.getElementById('evtType').value;
    document.getElementById('payload').value = JSON.stringify(templates[t][p](), null, 2);
  }
  fillTemplate();

  async function pull() {
    const feedUrl = document.getElementById('feedUrl').value.trim();
    const el = document.getElementById('pullResult');
    el.textContent = 'Забираю…';
    const r = await fetch('/api/pull', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ feedUrl }) });
    const d = await r.json();
    el.innerHTML = d.status === 200
      ? '<span class="ok">Получено объявлений: ' + d.count + '</span> — ' + (d.titles.join(', ') || '(пусто)')
      : '<span class="bad">HTTP ' + d.status + '</span> ' + (d.titles[0] || '');
    refresh();
  }

  async function fire() {
    const platform = document.getElementById('platform').value;
    const accountId = document.getElementById('accountId').value.trim();
    const el = document.getElementById('fireResult');
    if (!accountId) { el.innerHTML = '<span class="bad">Укажи Account ID</span>'; return; }
    let payload;
    try { payload = JSON.parse(document.getElementById('payload').value); }
    catch { el.innerHTML = '<span class="bad">Некорректный JSON</span>'; return; }
    el.textContent = 'Отправляю…';
    const r = await fetch('/api/fire-webhook', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ platform, accountId, payload }) });
    const d = await r.json();
    el.innerHTML = (d.status >= 200 && d.status < 300)
      ? '<span class="ok">Система ответила HTTP ' + d.status + '</span>'
      : '<span class="bad">HTTP ' + d.status + '</span> ' + d.sent;
    refresh();
  }

  function line(o) { return JSON.stringify(o); }
  async function refresh() {
    const s = await (await fetch('/api/state')).json();
    document.getElementById('feeds').textContent = s.feeds.map(line).join('\\n') || '—';
    document.getElementById('apiCalls').textContent = s.apiCalls.map(line).join('\\n') || '—';
    document.getElementById('webhooks').textContent = s.webhooks.map(line).join('\\n') || '—';
  }
  refresh();
  setInterval(refresh, 3000);
</script>
</body>
</html>`;
