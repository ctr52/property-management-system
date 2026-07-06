import { useState, type FormEvent } from 'react';
import { Button, Input, Stack } from '../../shared/ui';
import { useReply } from './useReply';

/**
 * Ввод ответа в диалог. Самодостаточная фича: владеет своей мутацией и локальным состоянием
 * ввода, наружу торчит только НАШ внутренний id диалога (threadId) — бэкенд сам резолвит площадку.
 */
export const ReplyForm = ({ threadId }: { threadId: string }) => {
  const reply = useReply();
  const [text, setText] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === '') return;
    reply.mutate({ threadId, text: trimmed }, { onSuccess: () => setText('') });
  };

  return (
    <form onSubmit={submit}>
      <Stack direction="row" gap={2}>
        <Input
          placeholder="Написать сообщение…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          css={{ flex: 1 }}
        />
        <Button type="submit" disabled={reply.isPending || text.trim() === ''}>
          {reply.isPending ? '…' : 'Отправить'}
        </Button>
      </Stack>
    </form>
  );
};
