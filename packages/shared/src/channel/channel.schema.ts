import { z } from 'zod';

export const PlatformSchema = z.enum(['avito', 'cian']);
export type Platform = z.infer<typeof PlatformSchema>;

/** Представление подключённого аккаунта площадки для клиента. */
export const ChannelAccountViewSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  platform: PlatformSchema,
  status: z.enum(['active', 'disabled']),
  /** URL фида, который арендодатель вставляет в кабинете площадки. */
  feedUrl: z.string().url(),
  hasCredentials: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ChannelAccountView = z.infer<typeof ChannelAccountViewSchema>;

/**
 * Подключение площадки. У обеих площадок нужны креды (хранятся в vault):
 * - Cian — Bearer ACCESS KEY на аккаунт (выдаётся вручную через import@cian.ru). Нужен для API
 *   (сообщения, статус публикации, модерация, статистика); публикация листингов идёт фидом.
 * - Avito — API client_id/client_secret (OAuth2).
 */
export const ConnectChannelInputSchema = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal('cian'),
    accessKey: z.string().min(1),
  }),
  z.object({
    platform: z.literal('avito'),
    apiClientId: z.string().min(1),
    apiClientSecret: z.string().min(1),
  }),
]);
export type ConnectChannelInput = z.infer<typeof ConnectChannelInputSchema>;

/** Ответ в диалог из инбокса по НАШЕМУ внутреннему id (бэкенд сам резолвит тред площадки). */
export const ReplyMessageInputSchema = z.object({
  threadId: z.string().uuid(),
  text: z.string().min(1).max(4000),
});
export type ReplyMessageInput = z.infer<typeof ReplyMessageInputSchema>;
