import type { AuthUserView } from '@pms/shared';
import type { User } from './types';

/** Чистый маппинг доменного User → безопасное представление (без хеша пароля). */
export const toAuthUserView = (user: User): AuthUserView => ({
  id: user.id,
  email: user.email,
  orgId: user.orgId,
  role: user.role,
});
