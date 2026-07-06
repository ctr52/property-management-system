import { useMutation } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

/** Триггер публикации фида аккаунта (собрать managed-листинги → выложить на хостинг). */
export const usePublishChannel = () =>
  useMutation({
    mutationFn: async (accountId: string) => {
      const res = await api.channels[':accountId'].publish.$post({ param: { accountId } });
      if (!res.ok) {
        throw new Error('Не удалось опубликовать фид');
      }
      return res.json();
    },
  });
