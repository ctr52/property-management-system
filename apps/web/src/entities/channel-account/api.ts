import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const channelKeys = {
  all: ['channels'] as const,
};

/** Список подключённых площадок организации. */
export const useChannels = () =>
  useQuery({
    queryKey: channelKeys.all,
    queryFn: async () => {
      const res = await api.channels.accounts.$get();
      if (!res.ok) {
        throw new Error('Не удалось загрузить площадки');
      }
      return res.json();
    },
  });
