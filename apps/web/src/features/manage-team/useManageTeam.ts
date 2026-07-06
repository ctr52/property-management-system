import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateMemberInput, MemberView } from '@pms/shared';
import { api } from '../../shared/api/client';
import { memberKeys } from '../../entities/member';

const extractMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
};

/** Owner добавляет участника (manager/cleaner). */
export const useCreateMember = () => {
  const queryClient = useQueryClient();
  return useMutation<MemberView, Error, CreateMemberInput>({
    mutationFn: async (input) => {
      const res = await api.auth.members.$post({ json: input });
      if (!res.ok) throw new Error(await extractMessage(res, 'Не удалось добавить участника'));
      return (await res.json()) as MemberView;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: memberKeys.all }),
  });
};
