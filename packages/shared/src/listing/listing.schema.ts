import { z } from 'zod';
import { PlatformSchema } from '../channel/channel.schema';

export const ListingModeSchema = z.enum(['managed', 'attached']);
export type ListingMode = z.infer<typeof ListingModeSchema>;

/** Фаза последней отправки (сырая state-machine). */
export const SyncPhaseSchema = z.enum(['queued', 'pushed', 'applied', 'error']);
export type SyncPhase = z.infer<typeof SyncPhaseSchema>;

/** Производный статус для UI: применилась ли последняя правка на площадке. */
export const ListingSyncStatusSchema = z.enum([
  'up_to_date',
  'syncing',
  'sent_unconfirmed',
  'error',
]);
export type ListingSyncStatus = z.infer<typeof ListingSyncStatusSchema>;

/** Связь «объект ↔ объявление на площадке» + статус синхронизации. */
export const ListingLinkViewSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  platform: PlatformSchema,
  mode: ListingModeSchema,
  externalId: z.string(),
  platformListingId: z.string().nullable(),
  /** Сводный статус для бейджа. */
  syncStatus: ListingSyncStatusSchema,
  phase: SyncPhaseSchema,
  desiredRevision: z.number().int(),
  appliedRevision: z.number().int().nullable(),
  lastPushedAt: z.string().datetime().nullable(),
  lastConfirmedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
});
export type ListingLinkView = z.infer<typeof ListingLinkViewSchema>;

/** Создать объявление через нашу платформу (managed — попадёт в фид). */
export const CreateListingInputSchema = z.object({
  propertyId: z.string().uuid(),
  platform: PlatformSchema,
});
export type CreateListingInput = z.infer<typeof CreateListingInputSchema>;

/** Привязать существующее объявление (attached — только маппинг). */
export const AttachListingInputSchema = z.object({
  propertyId: z.string().uuid(),
  platform: PlatformSchema,
  platformListingId: z.string().min(1),
});
export type AttachListingInput = z.infer<typeof AttachListingInputSchema>;
