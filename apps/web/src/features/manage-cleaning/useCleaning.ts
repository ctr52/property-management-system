import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';
import { cleaningKeys } from '../../entities/cleaning';

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: cleaningKeys.board });
    void queryClient.invalidateQueries({ queryKey: cleaningKeys.mine });
  };
};

export const useAssignCleaning = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; assigneeId: string }) => {
      const res = await api.cleaning[':id'].assign.$post({
        param: { id: input.id },
        json: { assigneeId: input.assigneeId },
      });
      if (!res.ok) throw new Error('Не удалось назначить');
      return res.json();
    },
    onSuccess: invalidate,
  });
};

export const useStartCleaning = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.cleaning[':id'].start.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось начать');
      return res.json();
    },
    onSuccess: invalidate,
  });
};

export const useCompleteCleaning = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.cleaning[':id'].complete.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось завершить');
      return res.json();
    },
    onSuccess: invalidate,
  });
};
