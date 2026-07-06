import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import { notificationKeys } from '../../entities/notification';

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: notificationKeys.feed });
};

export const useMarkRead = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.notifications[':id'].read.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось отметить');
      return res.json();
    },
    onSuccess: invalidate,
  });
};

export const useMarkAllRead = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => {
      const res = await api.notifications['read-all'].$post();
      if (!res.ok) throw new Error('Не удалось отметить все');
      return res.json();
    },
    onSuccess: invalidate,
  });
};
