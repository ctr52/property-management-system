/**
 * Общий каркас панели эмулятора: единый стиль, авто-обновляемый журнал, хелпер post().
 * Каждый эмулятор передаёт свои controlsHtml и (опц.) дополнительный script.
 */
export type PanelOptions = {
  readonly title: string;
  readonly accent: string;
  readonly systemBase: string;
  readonly intro: string;
  readonly controlsHtml: string;
  /** Доп. клиентский JS эмулятора (без вложенных backtick'ов). */
  readonly script?: string;
};

// Клиентский JS каркаса. Без template-literals/backtick'ов внутри — конкатенация строк.
const BASE_SCRIPT = `
async function refresh(){
  try {
    const r = await fetch('/__journal'); const items = await r.json();
    const el = document.getElementById('journal');
    el.innerHTML = items.map(function(e){
      var d = e.detail ? '<pre>'+String(e.detail).replace(/</g,'&lt;')+'</pre>' : '';
      return '<div class="log '+e.dir+'"><b>'+e.title+'</b> <span class="muted">'+e.at.slice(11,19)+'</span>'+d+'</div>';
    }).join('') || '<span class="muted">пусто</span>';
  } catch (e) {}
}
window.post = async function(url, body){
  try {
    const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) });
    setTimeout(refresh, 150);
    return await r.json().catch(function(){ return {}; });
  } catch (e) { return {}; }
};
setInterval(refresh, 1500); refresh();
`;

/** Хелперы для канальных панелей (pull фида + fire вебхука + автоподстановка id/времени). */
export const CHANNEL_SCRIPT = `
window.pull = function(){ post('/__pull', { feedUrl: document.getElementById('feedUrl').value }); };
// Отправка — как есть: шлём ровно то, что в поле, ничего не трогаем.
window.fire = function(textareaId){
  var raw = document.getElementById(textareaId).value;
  var payload; try { payload = JSON.parse(raw); } catch(e){ alert('Невалидный JSON'); return; }
  var secretEl = document.getElementById('secret');
  post('/__fire', { accountId: document.getElementById('acc').value, secret: secretEl ? secretEl.value : '', payload: payload });
};
// Свежий id (префикс сохраняем) — чтобы не словить дедуп по externalMessageId на бэкенде.
function freshId(seed){ return String(seed).replace(/[0-9].*$/, '') + Date.now() + '-' + Math.floor(Math.random()*1000); }
// Рекурсивно проставляем свежие id и текущее время. Покрывает обе формы:
//  - Avito: { payload:{ value:{ id, created:<unix-сек> } } }
//  - Cian:  { chats:[{ messages:[{ messageId, createdAt:<ISO> }] }] }
function freshenNode(node){
  if (Array.isArray(node)) { for (var i=0;i<node.length;i++) freshenNode(node[i]); return; }
  if (node && typeof node === 'object') {
    if (typeof node.id === 'string') node.id = freshId(node.id);
    if (typeof node.created === 'number') node.created = Math.floor(Date.now()/1000);
    if (typeof node.messageId === 'string') node.messageId = freshId(node.messageId);
    if (typeof node.createdAt === 'string') node.createdAt = new Date().toISOString();
    for (var k in node) if (Object.prototype.hasOwnProperty.call(node, k)) freshenNode(node[k]);
  }
}
// При загрузке панели: во всех JSON-полях — свежий id и текущее время.
(function(){
  var areas = document.getElementsByTagName('textarea');
  for (var i=0;i<areas.length;i++){
    var el = areas[i];
    var payload; try { payload = JSON.parse(el.value); } catch(e){ continue; }
    freshenNode(payload);
    el.value = JSON.stringify(payload, null, 2);
  }
})();
`;

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: #f5f6f8; color: #1a1a1a; }
header { padding: 20px 24px; background: #fff; border-bottom: 4px solid var(--accent); }
header h1 { margin: 0 0 4px; font-size: 22px; }
main { max-width: 860px; margin: 0 auto; padding: 24px; display: grid; gap: 16px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; }
.card h2 { margin: 0 0 12px; font-size: 15px; }
input, textarea, button, select { font: inherit; }
input, textarea { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 4px 0 10px; }
textarea { min-height: 120px; font-family: ui-monospace, monospace; font-size: 13px; }
label { font-size: 13px; color: #6b7280; }
button { padding: 8px 14px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
button:hover { filter: brightness(0.95); }
.muted { color: #6b7280; font-size: 12px; }
.log { padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
.log.out b { color: #1d4ed8; }
.log.in b { color: #15803d; }
.log pre { margin: 6px 0 0; background: #f8f9fb; padding: 8px; border-radius: 6px; overflow: auto; }
a { color: #2563eb; }
`;

export const renderPanel = (o: PanelOptions): string =>
  '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>' + o.title + '</title>' +
  '<style>:root{--accent:' + o.accent + '}' + STYLE + '</style></head><body>' +
  '<header><h1>' + o.title + '</h1><p class="muted">' + o.intro + '</p>' +
  '<p class="muted">Системный бэкенд: ' + o.systemBase + ' · <a href="http://localhost:4000">все эмуляторы</a></p></header>' +
  '<main>' + o.controlsHtml +
  '<section class="card"><h2>Журнал</h2><div id="journal"></div></section></main>' +
  '<script>' + BASE_SCRIPT + (o.script ?? '') + '</script></body></html>';
