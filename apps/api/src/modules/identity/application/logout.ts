import type { SessionRepo } from '../ports/repos';
import type { TokenGenerator } from '../ports/security';

export type LogoutDeps = {
  readonly sessions: SessionRepo;
  readonly tokens: TokenGenerator;
};

/** Удаляет серверную сессию (отзыв). Идемпотентно. */
export const logout =
  (deps: LogoutDeps) =>
  async (rawToken: string | null): Promise<void> => {
    if (!rawToken) return;
    await deps.sessions.delete(deps.tokens.hash(rawToken));
  };
