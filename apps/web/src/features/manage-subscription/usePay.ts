import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PayResult } from '@pms/shared';
import { api } from '../../shared/api/client';
import { subscriptionKeys } from '../../entities/subscription';

/**
 * Оплата периода подписки — единое действие для ЛЮБОГО статуса: продление триала/active или
 * реактивация из read-only. Путь выбирает сервер:
 *  - paid     — карта на файле, списание прошло → инвалидируем подписку, дата конца сдвигается;
 *  - redirect — карты нет → редирект на прямую оплату (хостед-страница шлюза), продление на вебхуке;
 *  - declined — карта отклонена → виджет показывает сообщение из mutation.data.
 *
 * returnUrl шлюзу = текущая страница биллинга; фронт сам на шлюз не ходит, только следует redirect.
 */
export const usePay = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PayResult> => {
      const res = await api.billing.pay.$post({
        json: { returnUrl: `${window.location.origin}/billing` },
      });
      if (!res.ok) throw new Error('Не удалось оплатить подписку');
      return res.json();
    },
    onSuccess: (result) => {
      if (result.kind === 'redirect') {
        window.location.assign(result.redirectUrl);
        return;
      }
      if (result.kind === 'paid') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.current });
      }
    },
  });
};
