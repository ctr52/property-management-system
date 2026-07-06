import { useState } from 'react';
import type { ListingLinkView, ListingSyncStatus, Platform } from '@pms/shared';
import { useChannels } from '../../entities/channel-account';
import { usePropertyListings } from '../../entities/listing';
import {
  useAttachListing,
  useCreateListing,
  useRemoveListing,
} from '../../features/manage-listing/useManageListing';
import { Button, Card, Input, Stack, Text } from '../../shared/ui';

const platformLabel: Record<Platform, string> = { avito: 'Avito', cian: 'Cian' };

const syncStatusLabel: Record<ListingSyncStatus, string> = {
  up_to_date: '✓ актуально',
  syncing: '⏳ синхронизируется',
  sent_unconfirmed: '↗ отправлено, без подтверждения',
  error: '⚠ ошибка',
};

/** Строка одной площадки: либо привязанное объявление, либо действия по привязке. */
const PlatformRow = ({
  propertyId,
  platform,
  link,
}: {
  propertyId: string;
  platform: Platform;
  link: ListingLinkView | undefined;
}) => {
  const create = useCreateListing(propertyId);
  const attach = useAttachListing(propertyId);
  const remove = useRemoveListing(propertyId);
  const [externalRef, setExternalRef] = useState('');

  return (
    <Card as="li">
      <Stack gap={2}>
        <Text weight={600}>{platformLabel[platform]}</Text>

        {link ? (
          <Stack gap={1}>
            <Stack direction="row" justify="space-between" align="center">
              <Text size="sm" muted>
                {link.mode === 'managed' ? 'через платформу' : 'привязано'} ·{' '}
                {syncStatusLabel[link.syncStatus]}
                {link.platformListingId ? ` · #${link.platformListingId}` : ''}
              </Text>
              <Button
                variant="secondary"
                disabled={remove.isPending}
                onClick={() => remove.mutate(link.id)}
              >
                Удалить
              </Button>
            </Stack>
            {link.syncStatus === 'error' && link.lastError && (
              <Text size="sm" css={(t) => ({ color: t.colors.danger })}>
                {link.lastError}
              </Text>
            )}
          </Stack>
        ) : (
          <Stack gap={2}>
            <Button
              disabled={create.isPending}
              onClick={() => create.mutate({ propertyId, platform })}
            >
              {create.isPending ? 'Создаём…' : 'Создать через платформу'}
            </Button>
            <Stack direction="row" gap={2}>
              <Input
                placeholder="ID/ссылка существующего объявления"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                css={{ flex: 1 }}
              />
              <Button
                variant="secondary"
                disabled={attach.isPending || externalRef.trim() === ''}
                onClick={() =>
                  attach.mutate(
                    { propertyId, platform, platformListingId: externalRef.trim() },
                    { onSuccess: () => setExternalRef('') },
                  )
                }
              >
                Привязать
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Card>
  );
};

/** Объявления объекта по подключённым площадкам. Самодостаточный виджет. */
export const ListingsPanel = ({ propertyId }: { propertyId: string }) => {
  const channels = useChannels();
  const listings = usePropertyListings(propertyId);

  const activePlatforms = (channels.data ?? [])
    .filter((account) => account.status === 'active')
    .map((account) => account.platform);

  if (channels.isLoading || listings.isLoading) {
    return <Text>Загрузка…</Text>;
  }

  if (activePlatforms.length === 0) {
    return <Text muted>Нет подключённых площадок. Подключите их на странице «Площадки».</Text>;
  }

  return (
    <Stack as="ul" gap={2} css={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {activePlatforms.map((platform) => (
        <PlatformRow
          key={platform}
          propertyId={propertyId}
          platform={platform}
          link={listings.data?.find((l) => l.platform === platform)}
        />
      ))}
    </Stack>
  );
};
