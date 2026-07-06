import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import {
  ConnectChannelInputSchema,
  ReplyMessageInputSchema,
  type ChannelAccountView,
  type ConnectChannelInput,
} from '@pms/shared';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';
import type { ChannelError, Platform } from '../domain/types';
import type { PublishResult } from '../application/publish-listings';
import type { FeedHost, StoredMessage } from '../ports/repos';
import type { RawWebhookRequest } from '../ports/adapter';

export type ChannelRouteDeps = {
  readonly publishListings: (accountId: string) => Promise<Result<PublishResult, AppError | ChannelError>>;
  readonly feedHost: FeedHost;
  readonly connectChannel: (orgId: string, input: ConnectChannelInput) => Promise<Result<ChannelAccountView, AppError>>;
  readonly listChannels: (orgId: string) => Promise<ChannelAccountView[]>;
  readonly disconnectChannel: (orgId: string, id: string) => Promise<Result<ChannelAccountView, AppError>>;
  readonly reconnectChannel: (orgId: string, id: string) => Promise<Result<ChannelAccountView, AppError>>;
  readonly deleteChannel: (orgId: string, id: string) => Promise<Result<{ removed: true }, AppError>>;
  readonly handleWebhook: (platform: Platform, accountId: string, req: RawWebhookRequest) => Promise<void>;
  readonly listMessages: (orgId: string) => Promise<StoredMessage[]>;
  /** Подписка на realtime-поток инбокса орги; возвращает функцию отписки. */
  readonly subscribeMessages: (
    orgId: string,
    listener: (envelope: { readonly event: string; readonly data: unknown }) => void,
  ) => () => void;
  readonly replyToThread: (
    orgId: string,
    threadId: string,
    text: string,
  ) => Promise<Result<void, AppError>>;
};

/**
 * ПУБЛИЧНЫЕ роуты площадок (без авторизации) — на отдельных префиксах, вне /channels:
 *  - GET /feeds/:accountId/feed.xml — площадка тянет фид pull'ом (защита: неугадываемый id),
 *  - POST /webhooks/:platform       — площадка шлёт вебхук (защита: подпись/секретный URL).
 */
export const createPublicChannelRoutes = (deps: ChannelRouteDeps) =>
  new Hono()
    .get('/feeds/:accountId/feed.xml', async (c) => {
      const doc = await deps.feedHost.get(c.req.param('accountId'));
      if (!doc) {
        return c.text('Feed not published yet', 404);
      }
      return c.body(doc.body, 200, { 'Content-Type': doc.contentType });
    })
    .post('/webhooks/:platform/:accountId', async (c) => {
      const platform = c.req.param('platform') as Platform;
      const accountId = c.req.param('accountId');
      const rawBody = await c.req.text();
      // Быстрый ack: обработку делаем тут же (in-memory), verify/parse внутри handleWebhook.
      await deps.handleWebhook(platform, accountId, {
        headers: c.req.header(), // все заголовки (verify сверяет подпись по нужному)
        rawBody,
      });
      return c.json({ accepted: true });
    });

/** ЗАЩИЩЁННЫЕ роуты (требуют сессию; orgId из контекста). */
export const createChannelRoutes = (deps: ChannelRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/accounts', requirePermission('channel:read'), async (c) => {
      return c.json(await deps.listChannels(c.get('auth').orgId));
    })
    .get('/messages', requirePermission('channel:read'), async (c) => {
      return c.json(await deps.listMessages(c.get('auth').orgId));
    })
    // Realtime инбокс: однонаправленный SSE-поток новых сообщений (named-событие `message`).
    // Клиент пишет их прямо в кэш TanStack Query (setQueryData), без глобального стора.
    .get('/messages/stream', requirePermission('channel:read'), (c) => {
      // Против буферизации на реверс-прокси (nginx и т.п.): отдаём поток сразу, не копим.
      c.header('Cache-Control', 'no-cache, no-transform');
      c.header('X-Accel-Buffering', 'no');
      return streamSSE(c, async (stream) => {
        const orgId = c.get('auth').orgId;
        const queue: { event: string; data: unknown }[] = [];
        let wake: (() => void) | null = null;
        const unsubscribe = deps.subscribeMessages(orgId, (envelope) => {
          queue.push(envelope);
          wake?.();
        });
        stream.onAbort(() => {
          unsubscribe();
          wake?.();
        });
        try {
          await stream.writeSSE({ event: 'ready', data: 'ok' });
          while (!stream.aborted) {
            while (queue.length > 0) {
              const item = queue.shift()!;
              await stream.writeSSE({ event: item.event, data: JSON.stringify(item.data) });
            }
            if (stream.aborted) break;
            // Ждём следующее событие либо таймаут (heartbeat против простоя за прокси).
            // queue.length проверяем ВНУТРИ executor'а: если сообщение пришло в момент настройки
            // ожидания (после слива выше), не зависаем до таймаута, а будимся сразу.
            let timer: ReturnType<typeof setTimeout> | undefined;
            const woke = await new Promise<'event' | 'timeout'>((resolve) => {
              wake = () => resolve('event');
              timer = setTimeout(() => resolve('timeout'), 25_000);
              if (queue.length > 0) resolve('event');
            });
            wake = null;
            clearTimeout(timer);
            if (woke === 'timeout' && !stream.aborted && queue.length === 0) {
              await stream.writeSSE({ event: 'ping', data: '' });
            }
          }
        } finally {
          unsubscribe();
        }
      });
    })
    .post('/messages/reply', requirePermission('channel:read'), zValidator('json', ReplyMessageInputSchema), async (c) => {
      const { threadId, text } = c.req.valid('json');
      const result = await deps.replyToThread(c.get('auth').orgId, threadId, text);
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json({ ok: true as const });
    })
    .post('/accounts', requirePermission('channel:manage'), zValidator('json', ConnectChannelInputSchema), async (c) => {
      const result = await deps.connectChannel(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value, 201);
    })
    .post('/accounts/:id/disconnect', requirePermission('channel:manage'), async (c) => {
      const result = await deps.disconnectChannel(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value);
    })
    .post('/accounts/:id/reconnect', requirePermission('channel:manage'), async (c) => {
      const result = await deps.reconnectChannel(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value);
    })
    .post('/accounts/:id/delete', requirePermission('channel:manage'), async (c) => {
      const result = await deps.deleteChannel(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      return c.json(result.value);
    })
    .post('/:accountId/publish', requirePermission('channel:manage'), async (c) => {
      const result = await deps.publishListings(c.req.param('accountId'));
      if (result.isErr()) {
        const status = result.error.kind === 'not_found' ? 404 : 400;
        return c.json({ error: result.error }, status);
      }
      return c.json(result.value);
    });
