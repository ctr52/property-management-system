import { useNotifications } from '../../entities/notification';
import { useMarkAllRead, useMarkRead } from '../../features/notification/useNotifications';
import { Button, Card, Heading, Stack, Text } from '../../shared/ui';

const formatTime = (iso: string) => new Date(iso).toLocaleString('ru-RU');

export const NotificationsPage = () => {
  const feed = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  return (
    <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <Stack direction="row" justify="space-between" align="center">
        <Heading>Уведомления</Heading>
        {feed.data && feed.data.unread > 0 && (
          <Button variant="secondary" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
            Прочитать все ({feed.data.unread})
          </Button>
        )}
      </Stack>

      {feed.isLoading && <Text muted>Загрузка…</Text>}
      {feed.data && feed.data.items.length === 0 && <Text muted>Пока нет уведомлений.</Text>}

      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {feed.data?.items.map((n) => (
          <Card as="li" key={n.id} css={(t) => ({ background: n.read ? t.colors.bg : t.colors.surface })}>
            <Stack direction="row" justify="space-between" align="flex-start" css={{ gap: 8 }}>
              <Stack gap={1}>
                <Text weight={600}>
                  {!n.read && '● '}
                  {n.title}
                </Text>
                <Text size="sm">{n.body}</Text>
                <Text size="sm" muted>
                  {formatTime(n.createdAt)}
                </Text>
              </Stack>
              {!n.read && (
                <Button variant="secondary" disabled={markRead.isPending} onClick={() => markRead.mutate(n.id)}>
                  Прочитать
                </Button>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};
