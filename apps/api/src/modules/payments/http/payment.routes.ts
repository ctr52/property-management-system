import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  BuildDirectPlanInputSchema,
  ConfirmManualPaymentInputSchema,
  ConnectProviderInputSchema,
  InitPaymentInputSchema,
  type BuildDirectPlanInput,
  type ConfirmManualPaymentInput,
  type ConnectProviderInput,
  type InitPaymentInput,
  type PaymentAccountView,
  type PaymentInitResult,
  type PaymentPlan,
  type PaymentView,
  type ProviderManifest,
} from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import type { AppEnv } from '../../../app-env';
import { requirePermission } from '../../../guards';
import type { RawWebhookRequest } from '../ports/provider';

export type PaymentRouteDeps = {
  readonly listProviders: () => Promise<ProviderManifest[]>;
  readonly listAccounts: (orgId: string) => Promise<PaymentAccountView[]>;
  readonly connectProvider: (orgId: string, input: ConnectProviderInput) => Promise<Result<PaymentAccountView, AppError>>;
  readonly disconnectProvider: (orgId: string, id: string) => Promise<Result<PaymentAccountView, AppError>>;
  readonly buildDirectPlan: (orgId: string, input: BuildDirectPlanInput) => Promise<Result<PaymentPlan, AppError>>;
  readonly initPayment: (orgId: string, input: InitPaymentInput) => Promise<Result<PaymentInitResult, AppError>>;
  readonly confirmManual: (
    orgId: string,
    actor: string,
    input: ConfirmManualPaymentInput,
  ) => Promise<Result<PaymentView, AppError>>;
  readonly listReservationPayments: (orgId: string, reservationId: string) => Promise<PaymentView[]>;
  readonly handleWebhook: (provider: string, accountId: string, req: RawWebhookRequest) => Promise<void>;
};

/**
 * ПУБЛИЧНЫЙ роут вебхука провайдера (без авторизации). Защита — неугадываемый accountId в URL
 * + проверка подписи внутри handleWebhook. Быстрый ack, обработка in-process (как у каналов).
 */
export const createPublicPaymentRoutes = (deps: PaymentRouteDeps) =>
  new Hono().post('/payment-webhooks/:provider/:accountId', async (c) => {
    const rawBody = await c.req.text();
    await deps.handleWebhook(c.req.param('provider'), c.req.param('accountId'), {
      headers: c.req.header(), // все заголовки (имя поля подписи у generic настраивается)
      rawBody,
    });
    return c.json({ accepted: true });
  });

/** ЗАЩИЩЁННЫЕ роуты (требуют сессию; orgId/actor из контекста). */
export const createPaymentRoutes = (deps: PaymentRouteDeps, requireAuth: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .use('*', requireAuth)
    .get('/providers', requirePermission('payment:read'), async (c) => c.json(await deps.listProviders()))
    .get('/accounts', requirePermission('payment:read'), async (c) =>
      c.json(await deps.listAccounts(c.get('auth').orgId)),
    )
    .post('/accounts', requirePermission('payment:manage'), zValidator('json', ConnectProviderInputSchema), async (c) => {
      const result = await deps.connectProvider(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value, 201);
    })
    .post('/accounts/:id/disconnect', requirePermission('payment:manage'), async (c) => {
      const result = await deps.disconnectProvider(c.get('auth').orgId, c.req.param('id'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .post('/plans', requirePermission('payment:manage'), zValidator('json', BuildDirectPlanInputSchema), async (c) => {
      const result = await deps.buildDirectPlan(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value, 201);
    })
    .post('/init', requirePermission('payment:manage'), zValidator('json', InitPaymentInputSchema), async (c) => {
      const result = await deps.initPayment(c.get('auth').orgId, c.req.valid('json'));
      if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
      return c.json(result.value);
    })
    .post(
      '/confirm-manual',
      requirePermission('payment:confirm'),
      zValidator('json', ConfirmManualPaymentInputSchema),
      async (c) => {
        const result = await deps.confirmManual(c.get('auth').orgId, c.get('auth').userId, c.req.valid('json'));
        if (result.isErr()) return c.json({ error: result.error }, httpStatusForError(result.error));
        return c.json(result.value);
      },
    )
    .get('/reservations/:reservationId/payments', requirePermission('payment:read'), async (c) =>
      c.json(await deps.listReservationPayments(c.get('auth').orgId, c.req.param('reservationId'))),
    );
