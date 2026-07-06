import type { Clock } from '../../../shared/ports';
import type { SessionRepo } from '../ports/repos';
import type { TokenGenerator } from '../ports/security';

export type IssueSessionDeps = {
  readonly sessions: SessionRepo;
  readonly tokens: TokenGenerator;
  readonly clock: Clock;
  readonly sessionTtlMs: number;
};

export type IssuedSession = { readonly token: string; readonly expiresAt: Date };

/** Создаёт сессию: генерит токен, сохраняет его ХЕШ, возвращает сырой токен для cookie. */
export const issueSession =
  (deps: IssueSessionDeps) =>
  async (userId: string): Promise<IssuedSession> => {
    const { raw, hash } = deps.tokens.generate();
    const now = deps.clock.now();
    const expiresAt = new Date(now.getTime() + deps.sessionTtlMs);

    await deps.sessions.save({
      id: hash,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    });

    return { token: raw, expiresAt };
  };
