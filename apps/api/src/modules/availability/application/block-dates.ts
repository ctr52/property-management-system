import { err, ok, type Result } from 'neverthrow';
import type { CreateBlockInput } from '@pms/shared';
import { type AppError, conflictError, notFoundError } from '../../../shared/errors';
import type { Clock, IdGen } from '../../../shared/ports';
import { validateRange } from '../domain/interval';
import type { AvailabilityHold } from '../domain/types';
import type { HoldRepo } from '../ports/hold-repo';

export type BlockDatesDeps = {
  readonly holds: HoldRepo;
  readonly idGen: IdGen;
  readonly clock: Clock;
};

/** Владелец закрывает даты вручную (ремонт/личное) — это hold вида 'block'. */
export const createBlock =
  (deps: BlockDatesDeps) =>
  async (orgId: string, input: CreateBlockInput): Promise<Result<AvailabilityHold, AppError>> => {
    const valid = validateRange(input.from, input.to);
    if (valid.isErr()) return err(valid.error);

    const now = deps.clock.now().toISOString();
    const hold: AvailabilityHold = {
      id: deps.idGen(),
      orgId,
      propertyId: input.propertyId,
      from: input.from,
      to: input.to,
      kind: 'block',
      tier: 'firm', // ручная блокировка — всегда жёсткая
      expiresAt: null,
      refId: null,
      note: input.note ?? null,
      createdAt: now,
    };
    const result = await deps.holds.insertIfFree(hold, now);
    return result.map((r) => r.hold);
  };

export const removeBlock =
  (deps: BlockDatesDeps) =>
  async (orgId: string, id: string): Promise<Result<{ removed: true }, AppError>> => {
    const hold = await deps.holds.getById(orgId, id);
    if (!hold) {
      return err(notFoundError('Блокировка не найдена'));
    }
    if (hold.kind !== 'block') {
      return err(conflictError('Снять можно только ручную блокировку, не бронь/уборку'));
    }
    await deps.holds.remove(orgId, id);
    return ok({ removed: true });
  };
