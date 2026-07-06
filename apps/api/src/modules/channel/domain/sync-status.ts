import type { ListingLink, PublishConfirmation, PublishFeedbackMode, SyncPhase } from './types';

/**
 * Производный статус для UI «применилась ли последняя правка на площадке»:
 *  - up_to_date       — площадка подтвердила текущую ревизию;
 *  - syncing          — правка в полёте (queued/pushed) или подтверждена устаревшая ревизия;
 *  - sent_unconfirmed — отправлено, но площадка не умеет подтверждать (честно, без вранья);
 *  - error            — последняя отправка отклонена.
 */
export type DerivedSyncStatus = 'up_to_date' | 'syncing' | 'sent_unconfirmed' | 'error';

export type SyncStatusInput = {
  readonly phase: SyncPhase;
  readonly desiredRevision: number;
  readonly appliedRevision: number | null;
};

/**
 * Сводит фазу + ревизии + возможности площадки в один статус (pure, без IO).
 * Ключ к честности: при publishFeedback='none' «applied» недостижим — после отправки
 * показываем sent_unconfirmed, а не фейковое up_to_date.
 */
export const deriveSyncStatus = (
  link: SyncStatusInput,
  feedback: PublishFeedbackMode,
): DerivedSyncStatus => {
  if (link.phase === 'error') return 'error';

  if (feedback === 'none') {
    return link.phase === 'pushed' || link.phase === 'applied' ? 'sent_unconfirmed' : 'syncing';
  }

  if (link.phase === 'applied' && link.appliedRevision === link.desiredRevision) {
    return 'up_to_date';
  }

  // queued/pushed, либо applied на устаревшей ревизии (есть более свежая правка в полёте).
  return 'syncing';
};

/**
 * Сводит подтверждение площадки в связь (pure). Подтверждение относится к последней
 * отправленной ревизии (pushedRevision); если desiredRevision уже ушла вперёд из-за новой
 * правки — статус сам останется 'syncing', потому что appliedRevision < desiredRevision.
 */
export const applyConfirmation = (
  link: ListingLink,
  confirmation: PublishConfirmation,
  now: string,
): ListingLink => {
  if (confirmation.outcome === 'error') {
    return {
      ...link,
      phase: 'error',
      lastConfirmedAt: now,
      lastError: confirmation.error ?? 'Площадка отклонила публикацию',
    };
  }

  const appliedRevision = confirmation.revision ?? link.pushedRevision ?? link.desiredRevision;
  return {
    ...link,
    phase: 'applied',
    appliedRevision,
    platformListingId: confirmation.platformListingId ?? link.platformListingId,
    lastConfirmedAt: now,
    lastError: null,
  };
};

/**
 * Помечает связь отправленной (pure): зафиксировали, какую ревизию выложили (pushedRevision),
 * фаза → pushed. Для фид-площадок это «фид обновлён» — площадка заберёт его позже (подтвердит
 * reconciler). appliedRevision не трогаем до подтверждения.
 */
export const markPushed = (link: ListingLink, now: string): ListingLink => ({
  ...link,
  phase: 'pushed',
  pushedRevision: link.desiredRevision,
  lastPushedAt: now,
});

/**
 * Помечает связь устаревшей после правки контента объекта (pure): желаемая ревизия растёт,
 * фаза возвращается к queued (нужна повторная отправка). appliedRevision не трогаем — площадка
 * пока держит старую версию, поэтому статус сам станет 'syncing' (applied < desired).
 */
export const markOutdated = (link: ListingLink): ListingLink => ({
  ...link,
  desiredRevision: link.desiredRevision + 1,
  phase: 'queued',
  lastError: null,
});
