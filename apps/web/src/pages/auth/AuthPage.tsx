import { useState, type FormEvent } from 'react';
import { useLogin, useRegister } from '../../features/auth/useAuth';
import { Button, Card, Heading, Input, Stack, Text } from '../../shared/ui';

type Mode = 'login' | 'register';

export const AuthPage = () => {
  const [mode, setMode] = useState<Mode>('login');
  const login = useLogin();
  const register = useRegister();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');

  const pending = login.isPending || register.isPending;
  const error = login.error ?? register.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'login') {
      login.mutate({ email, password });
    } else {
      register.mutate({ email, password, orgName });
    }
  };

  return (
    <Stack as="main" gap={3} css={{ maxWidth: 380, margin: '48px auto', padding: 24 }}>
      <Heading>{mode === 'login' ? 'Вход' : 'Регистрация'}</Heading>
      <Card>
        <form onSubmit={submit}>
          <Stack gap={2}>
            {mode === 'register' && (
              <Input
                placeholder="Название организации"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Пароль (мин. 8 символов)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={pending}>
              {pending ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </Button>
            {error && <Text css={(t) => ({ color: t.colors.danger })}>{error.message}</Text>}
          </Stack>
        </form>
      </Card>

      <Stack direction="row" gap={2} align="center">
        <Text size="sm" muted>
          {mode === 'login' ? 'Нет аккаунта?' : 'Уже зарегистрированы?'}
        </Text>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Создать' : 'Войти'}
        </Button>
      </Stack>
    </Stack>
  );
};
