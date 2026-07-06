import { useQuery } from '@tanstack/react-query';
import { can, type AuthUserView, type Permission } from '@pms/shared';
import { api } from '../../shared/api/client';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/**
 * Текущий пользователь. 401 → null (не авторизован) — это не ошибка загрузки,
 * поэтому ретраи отключаем и трактуем 401 как «гость».
 */
export const useMe = () =>
  useQuery({
    queryKey: authKeys.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AuthUserView | null> => {
      const res = await api.auth.me.$get();
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Не удалось проверить сессию');
      return (await res.json()) as AuthUserView;
    },
  });

/** Хук проверки прав текущего пользователя — та же модель `can`, что и на бэке. */
export const useCan = (): ((permission: Permission) => boolean) => {
  const me = useMe();
  return (permission) => (me.data ? can(me.data.role, permission) : false);
};
