import { useThreads } from '../../entities/inbox';
import { useLocationPath } from '../../shared/lib/router';
import { Link, Stack, Text } from '../../shared/ui';

const platformLabel: Record<string, string> = { avito: 'Avito', cian: 'Cian' };

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

/**
 * Список диалогов (левая колонка мессенджера). Самодостаточный виджет: сам тянет треды из кэша
 * и сам подсвечивает активный по URL — не знает ни про деталь чата, ни про раскладку страницы.
 */
export const ChatList = () => {
  const { threads, isLoading, isError } = useThreads();
  const path = useLocationPath();

  return (
    <Stack gap={0} css={{ height: '100%', overflowY: 'auto' }}>
      <Stack
        css={(t) => ({
          padding: `${t.space(3)} ${t.space(4)}`,
          borderBottom: `1px solid ${t.colors.border}`,
          position: 'sticky',
          top: 0,
          background: t.colors.bg,
        })}
      >
        <Text weight={600} size="lg">
          Диалоги
        </Text>
      </Stack>

      {isLoading && (
        <Text muted css={(t) => ({ padding: t.space(4) })}>
          Загрузка…
        </Text>
      )}
      {isError && (
        <Text css={(t) => ({ padding: t.space(4), color: t.colors.danger })}>Ошибка загрузки</Text>
      )}
      {!isLoading && threads.length === 0 && (
        <Text muted css={(t) => ({ padding: t.space(4) })}>
          Пока нет сообщений. Они появятся, когда площадка пришлёт вебхук.
        </Text>
      )}

      {threads.map((thread) => {
        const to = `/inbox/${thread.key}`;
        const active = path === to;
        return (
          <Link
            key={thread.key}
            to={to}
            css={(t) => ({
              display: 'block',
              padding: `${t.space(3)} ${t.space(4)}`,
              borderBottom: `1px solid ${t.colors.border}`,
              color: t.colors.text,
              background: active ? t.colors.surface : 'transparent',
              borderLeft: `3px solid ${active ? t.colors.link : 'transparent'}`,
              '&:hover': { textDecoration: 'none', background: t.colors.surface },
            })}
          >
            <Stack gap={1} css={{ minWidth: 0 }}>
              <Stack direction="row" justify="space-between" align="center" gap={2}>
                <Text weight={600}>
                  {platformLabel[thread.platform] ?? thread.platform}
                  <Text as="span" size="sm" muted>
                    {' · '}
                    {thread.externalThreadId}
                  </Text>
                </Text>
                <Text size="sm" muted css={{ flexShrink: 0 }}>
                  {formatTime(thread.last.sentAt)}
                </Text>
              </Stack>
              <Text
                size="sm"
                muted
                css={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {thread.last.direction === 'out' ? 'Вы: ' : ''}
                {thread.last.text}
              </Text>
            </Stack>
          </Link>
        );
      })}
    </Stack>
  );
};
