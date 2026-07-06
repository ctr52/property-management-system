import { useState, type FormEvent } from 'react';
import type { Role } from '@pms/shared';
import { useMembers } from '../../entities/member';
import { useCreateMember } from '../../features/manage-team/useManageTeam';
import { Button, Card, Heading, Input, Select, Stack, Text } from '../../shared/ui';

const roleLabel: Record<Role, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  cleaner: 'Клинер',
};

export const TeamPage = () => {
  const members = useMembers();
  const createMember = useCreateMember();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'manager' | 'cleaner'>('manager');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createMember.mutate(
      { email, password, role },
      {
        onSuccess: () => {
          setEmail('');
          setPassword('');
        },
      },
    );
  };

  return (
    <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <Heading>Команда</Heading>

      <Card>
        <form onSubmit={submit}>
          <Stack gap={2} css={{ maxWidth: 420 }}>
            <Text weight={600}>Добавить участника</Text>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Стартовый пароль (мин. 8)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Select value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'cleaner')}>
              <option value="manager">Менеджер</option>
              <option value="cleaner">Клинер</option>
            </Select>
            <Button type="submit" disabled={createMember.isPending}>
              {createMember.isPending ? 'Добавляем…' : 'Добавить'}
            </Button>
            {createMember.isError && (
              <Text css={(t) => ({ color: t.colors.danger })}>{createMember.error.message}</Text>
            )}
          </Stack>
        </form>
      </Card>

      {members.isLoading && <Text>Загрузка…</Text>}
      {members.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}

      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {members.data?.map((member) => (
          <Card as="li" key={member.id}>
            <Stack direction="row" justify="space-between" align="center">
              <Text>{member.email}</Text>
              <Text size="sm" muted>
                {roleLabel[member.role]}
              </Text>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};
