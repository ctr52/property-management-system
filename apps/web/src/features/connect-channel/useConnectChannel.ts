import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConnectChannelInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { channelKeys } from '../../entities/channel-account';

/** Подключить площадку. По успеху обновляет список. */
export const useConnectChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectChannelInput) => {
      const res = await api.channels.accounts.$post({ json: input });
      if (!res.ok) {
        throw new Error('Не удалось подключить площадку');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
    },
  });
};

/** Отключить площадку. */
export const useDisconnectChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.channels.accounts[':id'].disconnect.$post({ param: { id } });
      if (!res.ok) {
        throw new Error('Не удалось отключить площадку');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.all });
    },
  });
};

/** Включить отключённую площадку обратно. */
export const useReconnectChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.channels.accounts[':id'].reconnect.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось включить площадку');
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: channelKeys.all }),
  });
};

/** Удалить площадку насовсем. */
export const useDeleteChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.channels.accounts[':id'].delete.$post({ param: { id } });
      if (!res.ok) throw new Error('Не удалось удалить площадку');
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: channelKeys.all }),
  });
};
