import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  PayInputSchema,
  SubscribeInputSchema,
  type PayResult,
  type PlanView,
  type SubscribeResult,
  type SubscriptionView,
} from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';
import type { SubscribeOutcome, SubscribeToPlanInput } from '../application/subscribe-to-plan';
import type { PayForPeriodInput, PayForPeriodOutcome } from '../application/pay-for-period';
import { toSubscriptionView } from '../domain/view';

export type SubscriptionRouteDeps = {
  readonly subscribeToPlan: (orgId: string, input: SubscribeToPlanInput) => Promise<Result<SubscribeOutcome, AppError>>;
  readonly getSubscription: (orgId: string) => Promise<SubscriptionView | null>;
  /** Витрина доступных тарифов (для формы подписки). */
  readonly getPlans: () => Promise<readonly PlanView[]>;
  /** Оплата периода (продление триала/active ИЛИ реактивация из read-only) → active либо редирект на карту. */
  readonly pay: (orgId: string, input: PayForPeriodInput) => Promise<Result<PayForPeriodOutcome, AppError>>;
  /** Подтверждение auth-hold по вебхуку шлюза → старт carded-триала / оплата периода. paymentId из тела. */
  readonly confirmCardSetup: (paymentId: string) => Promise<unknown>;
};

/**
 * ПУБЛИЧНЫЙ роут вебхука биллинг-шлюза (без авторизации). Тело неподписано → доверять ему нельзя:
 * берём только id платежа, остальное use-case сверяет re-fetch'ем у шлюза. Быстрый ack.
 */
export const createPublicSubscriptionRoutes = (deps: SubscriptionRouteDeps) =>
  new Hono().post('/billing-webhooks/yookassa', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { object?: { id?: unknown } } | null;
    const id = body?.object?.id;
    if (typeof id === 'string') await deps.confirmCardSetup(id);
    return c.json({ accepted: true });
  });

/** Доменный outcome → shared-контракт результата. */
const toResult = (o: SubscribeOutcome): SubscribeResult => {
  switch (o.kind) {
    case 'trial_started':
      return { kind: 'trial_started', subscription: toSubscriptionView(o.subscription) };
    case 'card_required':
      return { kind: 'card_required', setupUrl: o.setup.url, reason: o.reason };
    case 'rejected':
      return { kind: 'rejected', reason: o.reason };
  }
};

/** Доменный outcome оплаты периода → shared-контракт. */
const toPayResult = (o: PayForPeriodOutcome): PayResult => {
  switch (o.kind) {
    case 'paid':
      return { kind: 'paid', subscription: toSubscriptionView(o.subscription) };
    case 'declined':
      return { kind: 'declined' };
    case 'card_required':
      return { kind: 'card_required', setupUrl: o.setup.url };
  }
};

/** Первый IP из X-Forwarded-For (мягкий сигнал риска; не доверяем телу запроса). */
const clientIp = (header: string | undefined): string | undefined => header?.split(',')[0]?.trim() || undefined;

/**
 * Подписка/триал (SaaS-биллинг тенанта). Защищено; org из сессии. Биллинг — действие владельца,
 * поэтому org:manage. phoneVerified и ip определяются на сервере, не из тела запроса.
 */
export const createSubscriptionRoutes = (deps: SubscriptionRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    // Статус подписки виден любому члену org (read-only лок касается всех ролей → баннер для всех).
    .get('/', async (c) => c.json(await deps.getSubscription(c.get('auth').orgId)))
    .get('/plans', requirePermission('org:manage'), async (c) => c.json(await deps.getPlans()))
    .post('/subscribe', requirePermission('org:manage'), zValidator('json', SubscribeInputSchema), async (c) => {
      const body = c.req.valid('json');
      const input: SubscribeToPlanInput = {
        planId: body.planId,
        phoneE164: body.phoneE164,
        returnUrl: body.returnUrl,
        risk: {
          ip: clientIp(c.req.header('x-forwarded-for')),
          deviceFingerprint: body.deviceFingerprint,
          emailDomain: body.emailDomain,
        },
      };
      const result = await deps.subscribeToPlan(c.get('auth').orgId, input);
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(toResult(result.value));
    })
    .post('/pay', requirePermission('org:manage'), zValidator('json', PayInputSchema), async (c) => {
      const result = await deps.pay(c.get('auth').orgId, { returnUrl: c.req.valid('json').returnUrl });
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(toPayResult(result.value));
    });
