import type { Clock } from '../../../shared/ports';
import type { AuthContext } from '../domain/types';
import type { SessionRepo, UserRepo } from '../ports/repos';
import type { TokenGenerator } from '../ports/security';

export type AuthenticateDeps = {
  readonly sessions: SessionRepo;
  readonly users: UserRepo;
  readonly tokens: TokenGenerator;
  readonly clock: Clock;
};

/**
 * Проверка сессии по сырому токену из cookie.
 * Возвращает контекст или null. Истёкшую сессию удаляет.
 */
export const authenticate =
  (deps: AuthenticateDeps) =>
  async (rawToken: string | null): Promise<AuthContext | null> => {
    if (!rawToken) return null;

    const session = await deps.sessions.getById(deps.tokens.hash(rawToken));
    if (!session) return null;

    if (Date.parse(session.expiresAt) <= deps.clock.now().getTime()) {
      await deps.sessions.delete(session.id);
      return null;
    }

    const user = await deps.users.getById(session.userId);
    if (!user) return null;

    return { userId: user.id, orgId: user.orgId, email: user.email, role: user.role };
  };
