import { useCan, useMe } from '../entities/auth';
import { useNotifications } from '../entities/notification';
import { useLogout } from '../features/auth/useAuth';
import { Button, Link, Stack, Text } from '../shared/ui';

/** Навигация: пункты скрыты по правам текущей роли. */
export const Nav = () => {
  const me = useMe();
  const can = useCan();
  const logout = useLogout();
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;

  return (
    <Stack
      as="nav"
      direction="row"
      justify="space-between"
      align="center"
      css={{ padding: '12px 24px', borderBottom: '1px solid #e5e7eb' }}
    >
      <Stack direction="row" gap={3}>
        {can('property:read') && <Link to="/properties">Объекты</Link>}
        {can('calendar:read') && <Link to="/calendar">Календарь</Link>}
        {can('channel:read') && <Link to="/inbox">Инбокс</Link>}
        {can('channel:read') && <Link to="/channels">Площадки</Link>}
        {can('payment:read') && <Link to="/payments">Платежи</Link>}
        {can('report:read') && <Link to="/reports">Отчёты</Link>}
        {can('commission:read') && <Link to="/commissions">Комиссии</Link>}
        {(can('cleaning:read') || can('cleaning:work')) && <Link to="/cleaning">Уборка</Link>}
        {can('notification:read') && (
          <Link to="/notifications">Уведомления{unread > 0 ? ` (${unread})` : ''}</Link>
        )}
        {can('org:manage') && <Link to="/team">Команда</Link>}
        {can('org:manage') && <Link to="/billing">Подписка</Link>}
      </Stack>
      <Stack direction="row" gap={2} align="center">
        {me.data && (
          <Text size="sm" muted>
            {me.data.email}
          </Text>
        )}
        <Button variant="secondary" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Выйти
        </Button>
      </Stack>
    </Stack>
  );
};
