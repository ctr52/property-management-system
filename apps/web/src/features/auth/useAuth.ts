import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthUserView, LoginInput, RegisterInput } from '@pms/shared';
import { api } from '../../shared/api/client';
import { authKeys } from '../../entities/auth';

const extractMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
};

export const useLogin = () => {
  const queryClient = useQueryClient();
  return useMutation<AuthUserView, Error, LoginInput>({
    mutationFn: async (input) => {
      const res = await api.auth.login.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось войти'));
      return (await res.json()) as AuthUserView;
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
};

export const useRegister = () => {
  const queryClient = useQueryClient();
  return useMutation<AuthUserView, Error, RegisterInput>({
    mutationFn: async (input) => {
      const res = await api.auth.register.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось зарегистрироваться'));
      return (await res.json()) as AuthUserView;
    },
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.auth.logout.$post();
    },
    // Сбрасываем весь кэш — чтобы данные одной организации не утекли к следующему входу.
    onSuccess: () => queryClient.clear(),
  });
};
