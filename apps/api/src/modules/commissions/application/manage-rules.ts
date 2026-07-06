import { ok, type Result } from 'neverthrow';
import type { CommissionRule, SetCommissionRuleInput } from '@pms/shared';
import type { AppError } from '../../../shared/errors';
import type { CommissionRuleRepo } from '../ports/repos';

export type ManageRulesDeps = {
  readonly rules: CommissionRuleRepo;
};

/** Список правил комиссий организации (по каналам). */
export const listCommissionRules =
  (deps: ManageRulesDeps) =>
  async (orgId: string): Promise<CommissionRule[]> =>
    deps.rules.listByOrg(orgId);

/** Установить/обновить правило комиссии для канала (upsert по source). */
export const setCommissionRule =
  (deps: ManageRulesDeps) =>
  async (orgId: string, input: SetCommissionRuleInput): Promise<Result<CommissionRule, AppError>> => {
    await deps.rules.set(orgId, input);
    return ok(input);
  };
