import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD');

/** Статус задачи уборки: todo → assigned → in_progress → done; любой не-done → cancelled. */
export const CleaningStatusSchema = z.enum(['todo', 'assigned', 'in_progress', 'done', 'cancelled']);
export type CleaningStatus = z.infer<typeof CleaningStatusSchema>;

/** Представление задачи уборки. propertyTitle/assigneeName фронт резолвит из своих запросов. */
export const CleaningTaskViewSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  reservationId: z.string().uuid().nullable(),
  date: dateString, // дата уборки (= дата выезда)
  status: CleaningStatusSchema,
  assigneeId: z.string().uuid().nullable(),
  guestName: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type CleaningTaskView = z.infer<typeof CleaningTaskViewSchema>;

export const AssignCleaningInputSchema = z.object({ assigneeId: z.string().uuid() });
export type AssignCleaningInput = z.infer<typeof AssignCleaningInputSchema>;

/** Клинер для выпадающего списка назначения. */
export const CleanerViewSchema = z.object({ id: z.string().uuid(), email: z.string() });
export type CleanerView = z.infer<typeof CleanerViewSchema>;

/** Ручное создание задачи уборки (помимо авто-генерации от выездов). */
export const CreateCleaningInputSchema = z.object({
  propertyId: z.string().uuid(),
  date: dateString,
});
export type CreateCleaningInput = z.infer<typeof CreateCleaningInputSchema>;
