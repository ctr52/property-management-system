import { useThread } from '../../entities/inbox';
import { ReplyForm } from '../../features/reply-message/ReplyForm';
import { Link, Stack, Text } from '../../shared/ui';

const platformLabel: Record<string, string> = { avito: 'Avito', cian: 'Cian' };

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

/**
 * Деталь диалога (правая колонка). Самодостаточный виджет: сам тянет сообщения по НАШЕМУ
 * внутреннему threadId, площадку/подпись берёт из самих сообщений. Лента — column-reverse:
 * новое снизу, прокрутка сама прижата к низу.
 */
export const ChatThread = ({ threadId }: { threadId: string }) => {
  const { messages, isLoading } = useThread(threadId);
  const head = messages[0];

  return (
    <Stack gap={0} css={{ height: '100%', minHeight: 0 }}>
      <Stack
        direction="row"
        align="center"
        gap={3}
        css={(t) => ({
          padding: `${t.space(3)} ${t.space(4)}`,
          borderBottom: `1px solid ${t.colors.border}`,
        })}
      >
        {/* Назад к списку — только на узких экранах (мастер-деталь). */}
        <Link
          to="/inbox"
          css={(t) => ({
            display: 'none',
            [`@media (max-width: ${t.breakpoints.md})`]: { display: 'inline' },
          })}
        >
          ← Назад
        </Link>
        <Text weight={600}>
          {head ? (platformLabel[head.platform] ?? head.platform) : 'Диалог'}
          {head && (
            <Text as="span" size="sm" muted>
              {' · чат '}
              {head.externalThreadId}
            </Text>
          )}
        </Text>
      </Stack>

      <Stack
        as="ul"
        gap={2}
        css={(t) => ({
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          flexDirection: 'column-reverse',
          listStyle: 'none',
          margin: 0,
          padding: t.space(4),
        })}
      >
        {isLoading && messages.length === 0 && <Text muted>Загрузка…</Text>}
        {/* messages по возрастанию; reverse → новое первым в DOM → снизу (column-reverse). */}
        {[...messages].reverse().map((message) => {
          const out = message.direction === 'out';
          return (
            <Stack
              as="li"
              key={`${message.platform}-${message.externalMessageId}`}
              align={out ? 'flex-end' : 'flex-start'}
            >
              <Stack
                gap={1}
                css={(t) => ({
                  maxWidth: '72%',
                  padding: `${t.space(2)} ${t.space(3)}`,
                  borderRadius: t.radii.lg,
                  background: out ? t.colors.primary : t.colors.surface,
                  border: out ? 'none' : `1px solid ${t.colors.border}`,
                  color: out ? t.colors.primaryText : t.colors.text,
                })}
              >
                <Text css={{ color: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {message.text}
                </Text>
                <Text size="sm" css={{ color: 'inherit', opacity: 0.7, alignSelf: 'flex-end' }}>
                  {formatTime(message.sentAt)}
                </Text>
              </Stack>
            </Stack>
          );
        })}
      </Stack>

      <Stack css={(t) => ({ padding: t.space(3), borderTop: `1px solid ${t.colors.border}` })}>
        <ReplyForm threadId={threadId} />
      </Stack>
    </Stack>
  );
};
