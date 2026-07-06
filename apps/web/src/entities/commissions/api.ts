import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const commissionKeys = {
  rules: ['commissions', 'rules'] as const,
  report: (from: string, to: string) => ['commissions', 'report', from, to] as const,
};

/** Ставки комиссий по каналам. */
export const useCommissionRules = () =>
  useQuery({
    queryKey: commissionKeys.rules,
    queryFn: async () => {
      const res = await api.commissions.rules.$get();
      if (!res.ok) throw new Error('Не удалось загрузить ставки комиссий');
      return res.json();
    },
  });

/** Отчёт по комиссиям за период [from, to). Включается, когда период валиден. */
export const useCommissionReport = (from: string, to: string) =>
  useQuery({
    queryKey: commissionKeys.report(from, to),
    enabled: Boolean(from && to && from < to),
    queryFn: async () => {
      const res = await api.commissions.report.$get({ query: { from, to } });
      if (!res.ok) throw new Error('Не удалось загрузить отчёт по комиссиям');
      return res.json();
    },
  });
