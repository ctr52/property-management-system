import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const cleaningKeys = {
  board: ['cleaning', 'board'] as const,
  mine: ['cleaning', 'mine'] as const,
  cleaners: ['cleaning', 'cleaners'] as const,
};

/** Доска уборок организации (менеджер). */
export const useCleaningBoard = () =>
  useQuery({
    queryKey: cleaningKeys.board,
    queryFn: async () => {
      const res = await api.cleaning.$get();
      if (!res.ok) throw new Error('Не удалось загрузить уборки');
      return res.json();
    },
  });

/** Мои задачи уборки (клинер). */
export const useMyCleaning = () =>
  useQuery({
    queryKey: cleaningKeys.mine,
    queryFn: async () => {
      const res = await api.cleaning.mine.$get();
      if (!res.ok) throw new Error('Не удалось загрузить задачи');
      return res.json();
    },
  });

/** Клинеры организации (для назначения). */
export const useCleaners = () =>
  useQuery({
    queryKey: cleaningKeys.cleaners,
    queryFn: async () => {
      const res = await api.cleaning.cleaners.$get();
      if (!res.ok) throw new Error('Не удалось загрузить клинеров');
      return res.json();
    },
  });
