# ADR-0001. Архитектура платежей (приём оплаты, channel-manager-style)

**Статус:** предложено · **Дата:** 2026-06-25 · **Контекст:** greenfield, не на проде, параллельная разработка.

## Контекст

Нужно принимать оплату за бронь через разные платёжные системы (Robokassa, далее ЮKassa,
CloudPayments). Принципиальная сложность из реальной практики площадок:

- **Сумма за бронь не платится одним платежом в одно место.** Часть собирает площадка, часть — мы.
- **Раскладка зависит от площадки.** Циан берёт предоплату, *завышая* цену аренды на её размер;
  остаток гость платит нам напрямую. Авито — гибко: часть через себя, остаток настраивается
  (через Авито или через нашу платформу).
- **Деньги идут на счёт арендодателя** (мы — не платёжный агент): на старте без сплит/маркетплейса.

Требование: максимальная гибкость и настраиваемость при высокой связности (cohesion) и низкой
связанности (coupling). Решение должно лечь на существующий функциональный гексагон и не
конфликтовать с параллельной работой над Reservations/Channels.

## Решение

### 1. Платёжный провайдер — структурный близнец `ChannelAdapter`

Новый модуль `apps/api/src/modules/payments` по тому же гексагону (`domain → ports → application →
adapters → http`). Провайдеры — capability-based адаптеры за портом `PaymentProviderAdapter`.
Переиспользуется готовая механика каналов: `IngestionStrategy` (push/poll/none), дедуп inbox,
`SecretVault`, `Scheduler`-reconciler, `Result`/neverthrow, registry.

### 2. Центральная модель — план оплаты из «ног» (legs), а не «платёж за бронь»

Сумма брони бьётся на **ноги** (`PaymentLeg`). У каждой ноги — свой **сборщик** (`collector`):

| collector | кто собирает | что делаем мы |
|---|---|---|
| `channel` | площадка (Циан-предоплата, часть Авито) | **только сверяем** статус из ingestion каналов; не инициируем |
| `provider` | мы, через Robokassa и т.п. | **инициируем** платёж, ловим вебхук, делаем возврат |

`Payment` нашего модуля = исполнение **одной provider-ноги**. Channel-ноги в `Payment` не
превращаются — их статус живёт на уровне `PaymentLeg` и сводится из нормализованного ingestion.

### 3. Площадко-специфика живёт в адаптере канала, не в платежах

Квирки Циана/Авито нельзя тащить в payments. Адаптер канала **декларирует свою платёжную
политику** новой опциональной capability (предлагается добавить в `ChannelAdapter`):

```ts
readonly paymentPolicy?: {
  split: (booking: NormalizedBooking) => Result<readonly PaymentLeg[], ChannelError>;
};
```

- Циан-адаптер: предоплата → нога `channel/prepayment` (уплачена площадкой), остаток → `provider`.
- Авито-адаптер: по настройке аккаунта отдаёт свой набор ног.
- Прямое бронирование (без площадки): одна `provider`-нога на всю сумму.

Payments зависит не от модуля channel, а от тонкого порта `ChannelSplitSource`
(`ports/repos.ts`), который в composition root реализуется поверх channel registry. Связь
односторонняя. Нейтральные типы `PaymentLeg`/`PaymentPlan` лежат в `@pms/shared`, чтобы оба
модуля их импортировали без зависимости друг на друга.

### 4. Идемпотентность (обязательна, как везде в проекте)

- **Inbox:** дедуп вебхука по `${provider}:${externalId}` (Robokassa повторяет ResultURL).
- **Outbox/Reconciler:** возвраты и страховочный poll статуса через `Scheduler`.
- Деньги — только minor units, без float.

### 5. Безопасность

Креды провайдера — в `SecretVault` (не в строке БД). Webhook-URL с неугадываемым `accountId`
(паттерн `createPublicChannelRoutes`). Подпись (Robokassa `SignatureValue` по `Password#2`)
проверяется в `verifyWebhook` до парсинга; битое/чужое тихо игнорируем.

### 6. Фронт (FSD)

`entities/payment` (статус-хук), `feature/pay-reservation` (mutation → redirect на hosted-страницу),
возврат на `/payment/return` → инвалидация query-ключа. Фронт ходит только на наш бэкенд.
Контракты — `packages/shared/src/payment`.

## Карта файлов (зафиксированные контракты — реализации ещё нет)

```
packages/shared/src/payment/payment.schema.ts   PaymentLeg, PaymentPlan, view/input zod-контракты
apps/api/src/modules/payments/
  domain/types.ts    Payment, PaymentIntent, PaymentEvent, PaymentError, PaymentCapabilities
  domain/status.ts   pure статусная машина платежа (transition)
  domain/plan.ts     pure достройка остатка в provider-ногу (buildPlanWithRemainder)
  ports/provider.ts  PaymentProviderAdapter, PaymentIngestion, PaymentAccount
  ports/repos.ts     PaymentRepo, PaymentPlanRepo, PaymentInbox, registry, ChannelSplitSource
```

## Что осознанно отложено

- **Сплит/маркетплейс** на стороне Robokassa (деньги идут арендодателю напрямую).
- **Депозит/залог** как отдельная нога (`purpose: 'deposit'`) — тип заложен, флоу удержания/возврата нет.
- **54-ФЗ чеки** — флаг `capabilities.receipts` заложен, генерация чека не описана.
- **Рекуррентные платежи / SaaS-биллинг** — `capabilities.recurring` заложен; биллинг подключится тем же портом.
- **Wiring в `index.ts`/`app.ts`** — намеренно не трогали, чтобы не ломать запуск; делается в реализующем PR.

## Открытые вопросы (на ревью команды)

1. `SecretVault` дублируется в channel и payments — промотить в `shared/ports`?
2. Где хранится `PaymentPlan` — отдельная таблица или проекция Reservations? (зависит от того, кто пилит брони)
3. `paymentPolicy` в `ChannelAdapter` — согласовать с владельцем модуля channel перед добавлением.
