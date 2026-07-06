import { z } from 'zod';

/** Тип — открытая строка (data-driven): новый вид уведомления не правит контракт. */
export const NotificationViewSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string().datetime(),
});
export type NotificationView = z.infer<typeof NotificationViewSchema>;

/** Лента уведомлений пользователя + счётчик непрочитанных. */
export const NotificationFeedSchema = z.object({
  items: z.array(NotificationViewSchema),
  unread: z.number().int().nonnegative(),
});
export type NotificationFeed = z.infer<typeof NotificationFeedSchema>;
