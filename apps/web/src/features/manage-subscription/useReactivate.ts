import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactivateResult } from '@pms/shared';
import { api } from '../../shared/api/client';
import { subscriptionKeys } from '../../entities/subscription';

/**
 * Оплата из read-only (expired/canceled) → active. Сервер сам выбирает путь:
 *  - activated     — карта на файле, списание прошло → инвалидируем подписку, баннер исчезнет;
 *  - card_required — карты нет → редирект на привязку (хостед-страница шлюза), активация на вебхуке;
 *  - declined      — карта отклонена → виджет показывает сообщение из mutation.data.
 *
 * returnUrl шлюзу = текущая страница биллинга; фронт сам на шлюз не ходит, только следует redirect.
 */
export const useReactivate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ReactivateResult> => {
      const res = await api.billing.reactivate.$post({
        json: { returnUrl: `${window.location.origin}/billing` },
      });
      if (!res.ok) throw new Error('Не удалось возобновить подписку');
      return res.json();
    },
    onSuccess: (result) => {
      if (result.kind === 'card_required') {
        window.location.assign(result.setupUrl);
        return;
      }
      if (result.kind === 'activated') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.current });
      }
    },
  });
};
