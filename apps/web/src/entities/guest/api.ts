import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const guestKeys = {
  byToken: (token: string) => ['guest', token] as const,
};

/** Публичная гостевая страница по токену (без авторизации). */
export const useGuestView = (token: string) =>
  useQuery({
    queryKey: guestKeys.byToken(token),
    queryFn: async () => {
      const res = await api.guest[':token'].$get({ param: { token } });
      if (!res.ok) {
        throw new Error('Бронь не найдена');
      }
      return res.json();
    },
  });
