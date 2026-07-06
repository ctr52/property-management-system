import { err, ok, type Result } from 'neverthrow';
import type { LoginInput } from '@pms/shared';
import { type AppError, unauthorizedError } from '../../../shared/errors';
import { toAuthUserView } from '../domain/user-view';
import type { UserRepo } from '../ports/repos';
import type { PasswordHasher } from '../ports/security';
import type { AuthResult } from './register';
import type { IssueSessionDeps } from './issue-session';
import { issueSession } from './issue-session';

export type LoginDeps = {
  readonly users: UserRepo;
  readonly hasher: PasswordHasher;
  readonly session: IssueSessionDeps;
};

// Одинаковая ошибка на «нет пользователя» и «неверный пароль» — без энумерации.
const INVALID = 'Неверная почта или пароль';

export const login =
  (deps: LoginDeps) =>
  async (input: LoginInput): Promise<Result<AuthResult, AppError>> => {
    const user = await deps.users.getByEmail(input.email);

    if (!user) {
      // Сжигаем сопоставимое время, чтобы по таймингу нельзя было отличить «нет юзера».
      await deps.hasher.hash(input.password);
      return err(unauthorizedError(INVALID));
    }

    if (!(await deps.hasher.verify(input.password, user.passwordHash))) {
      return err(unauthorizedError(INVALID));
    }

    const { token, expiresAt } = await issueSession(deps.session)(user.id);
    return ok({ user: toAuthUserView(user), token, expiresAt });
  };
