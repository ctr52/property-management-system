import { err, ok, type Result } from 'neverthrow';
import type { AuthUserView, RegisterInput } from '@pms/shared';
import { type AppError, conflictError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { toAuthUserView } from '../domain/user-view';
import type { OrgRepo, UserRepo } from '../ports/repos';
import type { PasswordHasher } from '../ports/security';
import type { IssueSessionDeps } from './issue-session';
import { issueSession } from './issue-session';

export type AuthResult = {
  readonly user: AuthUserView;
  readonly token: string;
  readonly expiresAt: Date;
};

export type RegisterDeps = {
  readonly orgs: OrgRepo;
  readonly users: UserRepo;
  readonly hasher: PasswordHasher;
  readonly session: IssueSessionDeps;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

/** Регистрация: создаёт организацию + владельца + сессию (multi-tenant). */
export const register =
  (deps: RegisterDeps) =>
  async (input: RegisterInput): Promise<Result<AuthResult, AppError>> => {
    if (await deps.users.getByEmail(input.email)) {
      return err(conflictError('Пользователь с таким email уже существует'));
    }

    const now = deps.clock.now().toISOString();
    const orgId = deps.idGen();
    await deps.orgs.save({ id: orgId, name: input.orgName, createdAt: now });

    const user = {
      id: deps.idGen(),
      orgId,
      email: input.email,
      passwordHash: await deps.hasher.hash(input.password),
      role: 'owner' as const,
      createdAt: now,
    };
    await deps.users.save(user);

    const { token, expiresAt } = await issueSession(deps.session)(user.id);
    return ok({ user: toAuthUserView(user), token, expiresAt });
  };
