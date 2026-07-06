import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const memberKeys = {
  all: ['members'] as const,
};

/** Участники организации (видит только owner — org:manage). */
export const useMembers = () =>
  useQuery({
    queryKey: memberKeys.all,
    queryFn: async () => {
      const res = await api.auth.members.$get();
      if (!res.ok) {
        throw new Error('Не удалось загрузить команду');
      }
      return res.json();
    },
  });
