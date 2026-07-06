import { parseThreadSelection, useInboxStream } from '../../entities/inbox';
import { useLocationPath } from '../../shared/lib/router';
import { ChatList } from '../../widgets/chat-list/ChatList';
import { ChatThread } from '../../widgets/chat-thread/ChatThread';
import { Stack } from '../../shared/ui';

/**
 * Инбокс в виде мессенджера: слева список диалогов, справа — выбранный чат. Текущий чат живёт в
 * URL по НАШЕМУ id (`/inbox/<threadId>`); площадочные id наружу не торчат. Раскладкой управляет
 * страница: виджеты width-agnostic
 * (тянутся на 100%), а кто и насколько широк — решает этот контейнер.
 *
 *  - чат не выбран → список на всю ширину;
 *  - чат выбран (широкий экран) → список 320px + лента справа;
 *  - чат выбран (узкий экран) → только лента (список скрыт, в шапке чата — «Назад»).
 */
export const InboxPage = () => {
  useInboxStream(); // realtime: SSE → кэш инбокса
  const path = useLocationPath();
  const selected = parseThreadSelection(path);

  return (
    <Stack
      as="main"
      direction="row"
      gap={0}
      align="stretch"
      css={(t) => ({ height: `calc(100dvh - ${t.layout.navHeight})`, overflow: 'hidden' })}
    >
      <Stack
        gap={0}
        css={(t) => ({
          minWidth: 0,
          flex: selected ? `0 0 ${t.space(80)}` : '1 1 auto',
          borderRight: selected ? `1px solid ${t.colors.border}` : 'none',
          ...(selected
            ? { [`@media (max-width: ${t.breakpoints.md})`]: { display: 'none' } }
            : {}),
        })}
      >
        <ChatList />
      </Stack>

      {selected && (
        <Stack gap={0} css={{ flex: '1 1 auto', minWidth: 0 }}>
          <ChatThread threadId={selected.threadId} />
        </Stack>
      )}
    </Stack>
  );
};
