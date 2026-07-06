import { useState, type FormEvent } from 'react';
import type { ConnectChannelInput, Platform } from '@pms/shared';
import { useConnectChannel } from '../../features/connect-channel/useConnectChannel';
import { Button, Heading, Input, Select, Stack, Text } from '../../shared/ui';

/**
 * Подключение площадки. Один и тот же компонент рендерится и на странице, и в модалке.
 * `onDone` — после успешного подключения и по «Отмене».
 */
export const ConnectChannel = ({ onDone }: { onDone?: () => void }) => {
  const connect = useConnectChannel();
  const [platform, setPlatform] = useState<Platform>('cian');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accessKey, setAccessKey] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input: ConnectChannelInput =
      platform === 'avito'
        ? { platform, apiClientId: clientId, apiClientSecret: clientSecret }
        : { platform, accessKey };
    connect.mutate(input, { onSuccess: () => onDone?.() });
  };

  return (
    <Stack css={{ padding: 24 }}>
      <form onSubmit={submit}>
        <Stack gap={3}>
          <Heading>Подключить площадку</Heading>
          <Stack gap={2}>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              <option value="cian">Cian (фид + API)</option>
              <option value="avito">Avito (фид + API)</option>
            </Select>

            {platform === 'cian' && (
              <Input
                placeholder="Cian ACCESS KEY (Bearer)"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                required
              />
            )}

            {platform === 'avito' && (
              <>
                <Input
                  placeholder="Avito API client_id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                />
                <Input
                  placeholder="Avito API client_secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                />
              </>
            )}
          </Stack>

          <Stack direction="row" gap={2}>
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? 'Подключаем…' : 'Подключить'}
            </Button>
            {onDone && (
              <Button type="button" variant="secondary" onClick={onDone}>
                Отмена
              </Button>
            )}
          </Stack>
          {connect.isError && (
            <Text css={(t) => ({ color: t.colors.danger })}>
              {connect.error instanceof Error ? connect.error.message : 'Ошибка'}
            </Text>
          )}
        </Stack>
      </form>
    </Stack>
  );
};
