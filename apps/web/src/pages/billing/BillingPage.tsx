import { Heading, Stack, Text } from '../../shared/ui';
import { SubscriptionPanel } from '../../widgets/subscription-panel/SubscriptionPanel';

export const BillingPage = () => (
  <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
    <Heading>Подписка</Heading>
    <Text muted>Оплата сервиса PMS. Комиссии по броням — на странице «Комиссии».</Text>
    <SubscriptionPanel />
  </Stack>
);
