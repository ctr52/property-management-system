import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const notificationKeys = {
  feed: ['notifications'] as const,
};

/** Лента уведомлений + счётчик непрочитанных. Поллинг (realtime-замена для MVP). */
export const useNotifications = () =>
  useQuery({
    queryKey: notificationKeys.feed,
    queryFn: async () => {
      const res = await api.notifications.$get();
      if (!res.ok) throw new Error('Не удалось загрузить уведомления');
      return res.json();
    },
    refetchInterval: 20000,
  });
