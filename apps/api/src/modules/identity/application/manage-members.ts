import { err, ok, type Result } from 'neverthrow';
import type { CreateMemberInput, MemberView } from '@pms/shared';
import { type AppError, conflictError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import type { User } from '../domain/types';
import type { UserRepo } from '../ports/repos';
import type { PasswordHasher } from '../ports/security';

export type ManageMembersDeps = {
  readonly users: UserRepo;
  readonly hasher: PasswordHasher;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

const toMemberView = (user: User): MemberView => ({
  id: user.id,
  email: user.email,
  role: user.role,
});

/** Owner добавляет участника (manager/cleaner) в свою организацию. */
export const createMember =
  (deps: ManageMembersDeps) =>
  async (orgId: string, input: CreateMemberInput): Promise<Result<MemberView, AppError>> => {
    if (await deps.users.getByEmail(input.email)) {
      return err(conflictError('Пользователь с таким email уже существует'));
    }
    const user: User = {
      id: deps.idGen(),
      orgId,
      email: input.email,
      passwordHash: await deps.hasher.hash(input.password),
      role: input.role,
      createdAt: deps.clock.now().toISOString(),
    };
    await deps.users.save(user);
    return ok(toMemberView(user));
  };

export const listMembers =
  (deps: ManageMembersDeps) =>
  async (orgId: string): Promise<MemberView[]> => {
    const users = await deps.users.listByOrg(orgId);
    return users.map(toMemberView);
  };
