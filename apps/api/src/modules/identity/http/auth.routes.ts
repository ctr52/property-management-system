import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  CreateMemberInputSchema,
  LoginInputSchema,
  RegisterInputSchema,
  type AuthUserView,
  type CreateMemberInput,
  type LoginInput,
  type MemberView,
  type RegisterInput,
} from '@pms/shared';
import type { MiddlewareHandler } from 'hono';
import type { Result } from 'neverthrow';
import type { AppEnv } from '../../../app-env';
import { type AppError, httpStatusForError } from '../../../shared/errors';
import { requirePermission } from '../../../guards';
import type { AuthResult } from '../application/register';
import { clearSessionCookie, readSessionToken, setSessionCookie } from './session-cookie';

export type AuthRouteDeps = {
  readonly register: (input: RegisterInput) => Promise<Result<AuthResult, AppError>>;
  readonly login: (input: LoginInput) => Promise<Result<AuthResult, AppError>>;
  readonly logout: (rawToken: string | null) => Promise<void>;
  readonly createMember: (orgId: string, input: CreateMemberInput) => Promise<Result<MemberView, AppError>>;
  readonly listMembers: (orgId: string) => Promise<MemberView[]>;
  readonly requireAuth: MiddlewareHandler<AppEnv>;
};

export const createAuthRoutes = (deps: AuthRouteDeps) =>
  new Hono<AppEnv>()
    .post('/register', zValidator('json', RegisterInputSchema), async (c) => {
      const result = await deps.register(c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      setSessionCookie(c, result.value.token, result.value.expiresAt);
      return c.json(result.value.user, 201);
    })
    .post('/login', zValidator('json', LoginInputSchema), async (c) => {
      const result = await deps.login(c.req.valid('json'));
      if (result.isErr()) {
        return c.json({ error: result.error }, httpStatusForError(result.error));
      }
      setSessionCookie(c, result.value.token, result.value.expiresAt);
      return c.json(result.value.user);
    })
    .post('/logout', deps.requireAuth, async (c) => {
      await deps.logout(readSessionToken(c));
      clearSessionCookie(c);
      return c.json({ ok: true as const });
    })
    .get('/me', deps.requireAuth, async (c) => {
      const auth = c.get('auth');
      const view: AuthUserView = {
        id: auth.userId,
        email: auth.email,
        orgId: auth.orgId,
        role: auth.role,
      };
      return c.json(view);
    })
    // --- Управление командой (только org:manage = owner) ---
    .get('/members', deps.requireAuth, requirePermission('org:manage'), async (c) => {
      return c.json(await deps.listMembers(c.get('auth').orgId));
    })
    .post(
      '/members',
      deps.requireAuth,
      requirePermission('org:manage'),
      zValidator('json', CreateMemberInputSchema),
      async (c) => {
        const result = await deps.createMember(c.get('auth').orgId, c.req.valid('json'));
        if (result.isErr()) {
          return c.json({ error: result.error }, httpStatusForError(result.error));
        }
        return c.json(result.value, 201);
      },
    );
