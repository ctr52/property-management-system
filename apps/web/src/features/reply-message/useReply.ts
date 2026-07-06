import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReplyMessageInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { inboxKeys } from '../../entities/inbox';

/** Ответ в тред площадки из инбокса. По успеху перезапрашивает сообщения. */
export const useReply = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReplyMessageInput) => {
      const res = await api.channels.messages.reply.$post({ json: input });
      if (!res.ok) {
        throw new Error('Не удалось отправить ответ');
      }
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: inboxKeys.all }),
  });
};
