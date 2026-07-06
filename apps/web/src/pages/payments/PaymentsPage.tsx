import { Heading, Stack, Text } from '../../shared/ui';
import { PaymentProvidersPanel } from '../../widgets/payment-providers-panel/PaymentProvidersPanel';

export const PaymentsPage = () => (
  <Stack as="main" gap={4} css={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
    <Heading>Платежи</Heading>
    <Text muted>Подключите платёжных провайдеров. Оплата брони — на странице объекта.</Text>
    <PaymentProvidersPanel />
  </Stack>
);
