import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const subscriptionKeys = {
  current: ['subscription'] as const,
  plans: ['subscription', 'plans'] as const,
};

/** Текущая подписка организации (статус, триал, read-only флаг). Виден любой роли. */
export const useSubscription = () =>
  useQuery({
    queryKey: subscriptionKeys.current,
    queryFn: async () => {
      const res = await api.billing.$get();
      if (!res.ok) throw new Error('Не удалось загрузить подписку');
      return res.json();
    },
  });

/** Доступные тарифы (для формы подписки). Только для org:manage — иначе сервер вернёт 403. */
export const usePlans = (enabled: boolean) =>
  useQuery({
    queryKey: subscriptionKeys.plans,
    enabled,
    queryFn: async () => {
      const res = await api.billing.plans.$get();
      if (!res.ok) throw new Error('Не удалось загрузить тарифы');
      return res.json();
    },
  });
