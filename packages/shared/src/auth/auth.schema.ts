import { z } from 'zod';

const email = z
  .string()
  .email('Некорректный email')
  .transform((value) => value.trim().toLowerCase());

const password = z.string().min(8, 'Пароль не короче 8 символов').max(200);

export const RegisterInputSchema = z.object({
  email,
  password,
  orgName: z.string().min(1, 'Укажите название').max(200),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const RoleSchema = z.enum(['owner', 'manager', 'cleaner']);
export type Role = z.infer<typeof RoleSchema>;

/** Представление текущего пользователя для клиента (без секретов). */
export const AuthUserViewSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  orgId: z.string().uuid(),
  role: RoleSchema,
});
export type AuthUserView = z.infer<typeof AuthUserViewSchema>;

/** Участник организации (для управления командой). */
export const MemberViewSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: RoleSchema,
});
export type MemberView = z.infer<typeof MemberViewSchema>;

/** Owner добавляет участника (manager/cleaner) со стартовым паролем. */
export const CreateMemberInputSchema = z.object({
  email,
  password,
  role: z.enum(['manager', 'cleaner']),
});
export type CreateMemberInput = z.infer<typeof CreateMemberInputSchema>;
