import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const pricingKeys = {
  byProperty: (propertyId: string) => ['pricing', propertyId] as const,
  quote: (propertyId: string, checkIn: string, checkOut: string) =>
    ['pricing', 'quote', propertyId, checkIn, checkOut] as const,
};

/** Прайсинг объекта: правила + ручные оверрайды. */
export const usePropertyPricing = (propertyId: string) =>
  useQuery({
    queryKey: pricingKeys.byProperty(propertyId),
    queryFn: async () => {
      const res = await api.pricing.property[':propertyId'].$get({ param: { propertyId } });
      if (!res.ok) {
        throw new Error('Не удалось загрузить прайсинг');
      }
      return res.json();
    },
  });

/**
 * Расчёт цены проживания по DSL (сумма ночей + per-night). Включается сам, когда даты валидны
 * (checkIn < checkOut) — виджет получает цену по мере заполнения формы, без отдельной кнопки.
 */
export const useStayQuote = (propertyId: string, checkIn: string, checkOut: string) =>
  useQuery({
    queryKey: pricingKeys.quote(propertyId, checkIn, checkOut),
    enabled: Boolean(propertyId && checkIn && checkOut && checkIn < checkOut),
    queryFn: async () => {
      const res = await api.pricing.quote.$get({ query: { propertyId, checkIn, checkOut } });
      if (!res.ok) {
        throw new Error('Не удалось рассчитать стоимость');
      }
      return res.json();
    },
  });
