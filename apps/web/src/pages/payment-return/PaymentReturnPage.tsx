import { Button, Card, Heading, Stack, Text } from '../../shared/ui';

/**
 * Куда провайдер возвращает браузер после оплаты (SuccessURL). Статус двигает вебхук
 * (ResultURL, сервер→сервер) — здесь только подтверждение и возврат в приложение.
 */
export const PaymentReturnPage = () => (
  <Stack as="main" gap={3} css={{ padding: 24, maxWidth: 480, margin: '60px auto' }}>
    <Heading>Оплата получена</Heading>
    <Card>
      <Stack gap={2}>
        <Text>Спасибо! Платёж обрабатывается — статус брони обновится автоматически.</Text>
        <Button
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Вернуться в приложение
        </Button>
      </Stack>
    </Card>
  </Stack>
);
