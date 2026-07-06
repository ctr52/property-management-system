import type { ChannelAccountView, Platform } from '@pms/shared';
import { useChannels } from '../../entities/channel-account';
import {
  useDeleteChannel,
  useDisconnectChannel,
  useReconnectChannel,
} from '../../features/connect-channel/useConnectChannel';
import { usePublishChannel } from '../../features/publish-channel/usePublishChannel';
import { Button, Card, Input, LinkButton, Stack, Text } from '../../shared/ui';

const platformLabel: Record<Platform, string> = { avito: 'Avito', cian: 'Cian' };

const CopyRow = ({ label, value }: { label: string; value: string }) => (
  <Stack gap={1}>
    <Text size="sm" muted>
      {label}
    </Text>
    <Stack direction="row" gap={2}>
      <Input readOnly value={value} css={{ flex: 1 }} />
      <Button type="button" variant="secondary" onClick={() => void navigator.clipboard?.writeText(value)}>
        Копировать
      </Button>
    </Stack>
  </Stack>
);

/** Строка аккаунта: статус + ID (для эмулятора/вебхуков) + feed-URL + публикация + lifecycle. */
const AccountRow = ({ account }: { account: ChannelAccountView }) => {
  const disconnect = useDisconnectChannel();
  const reconnect = useReconnectChannel();
  const remove = useDeleteChannel();
  const publish = usePublishChannel();
  const active = account.status === 'active';
  const busy = disconnect.isPending || reconnect.isPending || remove.isPending;

  return (
    <Card as="li">
      <Stack gap={2}>
        <Stack direction="row" justify="space-between" align="center">
          <Text weight={600}>
            {platformLabel[account.platform]}
            {!active && ' · отключена'}
          </Text>
          <Stack direction="row" gap={2}>
            {active ? (
              <Button variant="secondary" disabled={busy} onClick={() => disconnect.mutate(account.id)}>
                Отключить
              </Button>
            ) : (
              <>
                <Button disabled={busy} onClick={() => reconnect.mutate(account.id)}>
                  Подключить заново
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Удалить площадку насовсем?')) remove.mutate(account.id);
                  }}
                >
                  Удалить
                </Button>
              </>
            )}
          </Stack>
        </Stack>

        <CopyRow label="ID аккаунта (введите в эмуляторе «Account ID»)" value={account.id} />
        <CopyRow label="URL фида — вставьте в кабинете площадки" value={account.feedUrl} />

        {active && (
          <Stack direction="row" gap={2} align="center">
            <Button type="button" disabled={publish.isPending} onClick={() => publish.mutate(account.id)}>
              {publish.isPending ? 'Публикуем…' : 'Опубликовать фид'}
            </Button>
            {publish.isSuccess && (
              <Text size="sm" muted>
                Выложено объявлений: {publish.data.count}
              </Text>
            )}
            {publish.isError && (
              <Text size="sm" css={(t) => ({ color: t.colors.danger })}>
                Ошибка публикации
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
};

/** Самодостаточный виджет: подключённые площадки + форма подключения. */
export const ChannelPanel = () => {
  const channels = useChannels();

  return (
    <Stack gap={4}>
      <Stack direction="row">
        <LinkButton to="/channels" modal="/channels/new">Подключить площадку</LinkButton>
      </Stack>

      {channels.isLoading && <Text>Загрузка…</Text>}
      {channels.isError && <Text css={(t) => ({ color: t.colors.danger })}>Ошибка загрузки</Text>}

      <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {channels.data?.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}
      </Stack>
    </Stack>
  );
};
