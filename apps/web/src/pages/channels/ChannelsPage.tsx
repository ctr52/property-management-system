import { Heading, Stack } from '../../shared/ui';
import { ChannelPanel } from '../../widgets/channel-panel/ChannelPanel';

export const ChannelsPage = () => (
  <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
    <Heading>Площадки</Heading>
    <ChannelPanel />
  </Stack>
);
