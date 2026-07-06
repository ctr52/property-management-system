import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { EMULATORS } from './registry';
import type { Emulator } from './kit/types';

/**
 * Лаунчер песочницы: поднимает каждый эмулятор на СВОЁМ порту (отдельный адрес в строке браузера)
 * + хаб на :4000 со ссылками. Реестр-движок: один процесс, один `dev`, но N независимых адресов.
 */
const systemBase = process.env.SYSTEM_BASE ?? 'http://localhost:3000';
const HUB_PORT = Number(process.env.SANDBOX_HUB_PORT ?? 4000);

const kindLabel: Record<Emulator['kind'], string> = { channel: 'Площадки', payment: 'Платёжные системы' };

const hubHtml = (): string => {
  const groups = (['channel', 'payment'] as const)
    .map((kind) => {
      const items = EMULATORS.filter((e) => e.kind === kind);
      if (items.length === 0) return '';
      const cards = items
        .map(
          (e) =>
            '<a class="card" style="border-left:4px solid ' + e.accent + '" href="http://localhost:' + e.port + '">' +
            '<b>' + e.label + '</b><span class="port">:' + e.port + '</span><p>' + e.blurb + '</p></a>',
        )
        .join('');
      return '<h2>' + kindLabel[kind] + '</h2><div class="grid">' + cards + '</div>';
    })
    .join('');
  return (
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>PMS · Песочница интеграций</title><style>' +
    'body{font-family:system-ui,sans-serif;margin:0;background:#f5f6f8;color:#1a1a1a}' +
    'header{padding:20px 24px;background:#fff;border-bottom:1px solid #e5e7eb}h1{margin:0;font-size:20px}' +
    'main{max-width:860px;margin:0 auto;padding:24px}h2{font-size:14px;color:#6b7280;margin:20px 0 10px}' +
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}' +
    '.card{display:block;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-decoration:none;color:inherit}' +
    '.card:hover{box-shadow:0 2px 8px rgba(0,0,0,.06)}.card .port{color:#6b7280;font-size:12px;margin-left:6px}' +
    '.card p{margin:6px 0 0;font-size:13px;color:#6b7280}' +
    '</style></head><body><header><h1>PMS · Песочница интеграций</h1>' +
    '<p style="margin:4px 0 0;color:#6b7280;font-size:13px">Системный бэкенд: ' + systemBase + '</p></header>' +
    '<main>' + groups + '</main></body></html>'
  );
};

for (const emu of EMULATORS) {
  const app = emu.createApp({ systemBase });
  serve({ fetch: app.fetch, port: emu.port }, () => {
    // eslint-disable-next-line no-console
    console.log('[sandbox] ' + emu.label.padEnd(12) + ' → http://localhost:' + emu.port);
  });
}

const hub = new Hono();
hub.get('/', (c) => c.html(hubHtml()));
serve({ fetch: hub.fetch, port: HUB_PORT }, () => {
  // eslint-disable-next-line no-console
  console.log('[sandbox] ' + 'Хаб'.padEnd(12) + ' → http://localhost:' + HUB_PORT);
});
