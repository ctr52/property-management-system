import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SubscribeResult } from '@pms/shared';
import { api } from '../../shared/api/client';
import { subscriptionKeys } from '../../entities/subscription';

export type SubscribeFormInput = {
  readonly planId: string;
  readonly phoneE164: string;
};

/**
 * Подписаться на план. Сервер решает политику ([[trial-policy]]) и возвращает дискриминированный
 * результат:
 *  - trial_started — выдан cardless-триал → инвалидируем подписку, виджет перерисуется;
 *  - card_required — нужна привязка карты → редиректим на хостед-страницу шлюза (setupUrl);
 *  - rejected — отказ политики → виджет показывает reason из mutation.data.
 *
 * returnUrl (куда шлюз вернёт после привязки карты) задаём текущим адресом биллинга — фронт
 * никогда не ходит на шлюз сам, только следует его redirect.
 */
export const useSubscribe = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubscribeFormInput): Promise<SubscribeResult> => {
      const res = await api.billing.subscribe.$post({
        json: {
          planId: input.planId,
          phoneE164: input.phoneE164,
          returnUrl: `${window.location.origin}/billing`,
        },
      });
      if (!res.ok) throw new Error('Не удалось оформить подписку');
      return res.json();
    },
    onSuccess: (result) => {
      if (result.kind === 'card_required') {
        window.location.assign(result.setupUrl);
        return;
      }
      if (result.kind === 'trial_started') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.current });
      }
    },
  });
};
