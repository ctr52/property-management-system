# ADR-0002. Подключение сторонних платёжных систем (open registry + манифест)

**Статус:** предложено · **Дата:** 2026-06-25 · **Контекст:** надстройка над ADR-0001, реализаций ещё нет.

## Контекст

ADR-0001 описал платежи как channel-manager-style гексагон: provider-ноги исполняются за портом
`PaymentProviderAdapter`, провайдеры лежат в registry. Но идентичность провайдера зашита закрыто:

- `PaymentProviderSchema = z.enum(['robokassa'])` — добавить рельс нельзя без правки shared-типа,
  перекомпиляции фронта и бэка.
- `ConnectProviderInputSchema` — discriminated union с захардкоженными полями кред под каждый
  `provider`. Форма подключения завязана на код: новый провайдер = правка union → правка UI.

Задача: дать арендодателю подключать **сторонние** ПС помимо тех, под которые мы пишем встроенный
код. При этом сохранить слабую связанность и не трогать рабочий seam (`PaymentProviderAdapter`,
ingestion, legs, vault — они уже provider-agnostic).

Решено (ревью команды, 2026-06-25): поддерживаем **generic config-driven** (long tail) и
**manual/offline**; форма подключения — **data-driven из манифеста**. Новые first-party-адаптеры
(ЮKassa/CloudPayments) — тем же механизмом, отдельного решения не требуют.

## Решение

### 1. `PaymentProvider` — открытый ключ адаптера-стратегии, а не бренд

`PaymentProviderSchema` становится открытой строкой. Семантика идентификатора уточняется:

> **provider id = id адаптера-стратегии (рельса), не бренда ПС.**

- First-party: 1:1 с брендом (`robokassa`, позже `yookassa`).
- Generic: id — это **стратегия** (`generic-hosted-link`, `manual`); конкретный бренд
  («Acme Pay») живёт в `PaymentAccount` (поле-конфиг), а не в id. Один generic-адаптер
  обслуживает много брендов через разные аккаунты.

`PaymentLeg.collector` (`kind:'provider'`) и `Payment.provider` продолжают ссылаться на этот id —
модель legs/collector из ADR-0001 **не меняется**.

### 2. `ProviderManifest` — провайдер описывает себя данными

То, что раньше было размазано по enum + discriminated union, становится дескриптором. Registry
отдаёт список манифестов; всё ниже строится из них:

- `capabilities` (`refunds/recurring/receipts/ingest`) — мягкая деградация уже в домене.
- `connectSchema: ConnectFieldSpec[]` — какие поля просить при подключении (включая, для generic,
  `endpointUrl`, `secretKey`, выбор алгоритма подписи и человекочитаемый бренд).
- `kind: 'first-party' | 'generic-hosted-link' | 'manual'`.

`GET /payments/providers` отдаёт манифесты → фронт рендерит и список рельсов, и форму подключения
динамически. Добавление провайдера больше **не трогает ни shared-DU, ни UI**.

### 3. `ConnectProviderInput` — валидация по манифесту, не по union

Вместо discriminated union — нейтральная форма `{ provider, credentials: Record<string,string> }`.
Use-case `connectProvider` валидирует `credentials` против `connectSchema` манифеста в рантайме
(обязательность, тип поля), затем кладёт секретные поля в `SecretVault`, несекретные (endpointUrl,
бренд) — в конфиг аккаунта.

### 4. Два generic-адаптера за тем же портом

Оба реализуют `PaymentProviderAdapter`, разница — только реализация и `capabilities`:

- **`generic-hosted-link`** — параметризуется конфигом аккаунта (endpoint hosted-страницы, шаблон
  полей, алгоритм подписи HMAC-SHA256/MD5 по шаблону, маппинг полей вебхука). `initPayment` строит
  подписанный redirect; `verifyWebhook`/`parseWebhook` — по конфигу. Обычно `refunds:false`,
  `ingest:'push'`. Покрывает большинство мелких РФ-эквайрингов с payment link.
- **`manual`** — оплата вне системы (счёт/перевод), `ingest:'none'`, `initPayment` отдаёт
  реквизиты/инструкцию. Статус закрывается ручным use-case `confirmManualPayment` под отдельным
  permission, с обязательной записью в audit log. Honest fallback, когда у ПС нет API.

### 5. Безопасность (новое именно для сторонних)

- **SSRF.** Конфиг generic-провайдера содержит произвольные URL из рук арендодателя. `initPayment`
  и регистрация аккаунта валидируют хост по allowlist/правилам (нет private-ranges, только https).
  Это новое требование — у first-party endpoint захардкожен в адаптере.
- **Подпись.** `verifyWebhook` generic-адаптера проверяет подпись по алгоритму из конфига до
  парсинга; битое/чужое тихо игнорируем (паттерн ADR-0001 §5).
- **Ручное подтверждение** — отдельный permission, не путать с автоматическим вебхуком; всегда в
  audit log.
- Креды — в `SecretVault`, деньги — minor units, inbox-дедуп по `${provider}:${externalId}` —
  **без изменений** из ADR-0001.

### 6. Фронт (FSD)

`GET /payments/providers` → `entities/payment` (манифесты); `feature/connect-provider` рендерит
форму из `connectSchema`. Остальное (`pay-reservation`, return-route) из ADR-0001 без изменений.
Фронт по-прежнему ходит только на наш бэкенд.

## Карта правок контрактов (реализаций адаптеров ещё нет)

```
packages/shared/src/payment/payment.schema.ts
  PaymentProviderSchema           enum → z.string().min(1) (id адаптера-стратегии)
  ConnectFieldSpecSchema          новый: поле формы подключения (key/label/secret/required/kind)
  PaymentCapabilitiesSchema       новый: client-facing зеркало домена для манифеста
  ProviderManifestSchema          новый: id/title/kind/capabilities/connectSchema
  ConnectProviderInputSchema      DU → { provider, credentials: Record<string,string> }
apps/api/src/modules/payments/
  ports/provider.ts   + manifest: ProviderManifest на PaymentProviderAdapter
                      + config на PaymentAccount (несекретный конфиг generic-аккаунта)
                      verifyWebhook/parseWebhook: + account, sync Result → ResultAsync
                      (подпись — секрет КОНКРЕТНОГО аккаунта, резолв из vault асинхронный)
  ports/repos.ts      + PaymentProviderRegistry.list(); резолв по string-id
```

Реализующий PR (ADR-0002) добавляет вертикальный срез, не трогая модули channel/reservation
(нейтральные входы, прямой план через существующий `domain/plan.ts`):

```
shared/payment.schema.ts  + PaymentAccountView, BuildDirectPlanInput, ConfirmManualPaymentInput
adapters/registry.ts                 createPaymentProviderRegistry (get + list)
adapters/generic/hosted-link.ts      generic-hosted-link: подписанный redirect + HMAC-вебхук, SSRF-гард
adapters/generic/manual.ts           manual: ingest='none', initPayment='unsupported' (закрытие через confirm)
adapters/generic/ssrf.ts             isPublicHttpsUrl (pure)
adapters/memory/memory-repos.ts      in-memory PaymentRepo/PaymentPlanRepo/PaymentInbox/PaymentAccountRepo/Vault
application/manage-providers.ts      listProviders, connectProvider, listAccounts, disconnect
application/build-plan.ts            buildDirectPlan (provider-нога на всю сумму)
application/init-payment.ts          initPayment → redirect-инструкция
application/confirm-manual.ts        confirmManualPayment (permission payment:confirm, audit)
application/handle-webhook.ts        verify → parse → дедуп inbox → статус Payment + leg
application/read-payments.ts         listByReservation (PaymentView)
http/payment.routes.ts               public webhook + protected (payment:read/manage/confirm)
shared/auth/permissions.ts           + payment:read / payment:manage / payment:confirm
```

## Что осознанно отложено

- **Реализации generic-адаптеров и use-cases** (`connectProvider`, `confirmManualPayment`) — как в
  ADR-0001, контракты фиксируем, код в реализующем PR.
- **Универсальный config-driven маппинг полей/подписи** для `generic-hosted-link` — форму конфига
  фиксируем через `connectSchema`, движок шаблонов/подписи описывается в реализующем PR.
- **Маркетплейс сторонних адаптеров / загрузка кода извне** — нет. Generic-стратегии фиксированы
  нами; «расширяемость» = данные (манифест/конфиг), а не чужой код в рантайме.

## Открытые вопросы

1. Где хранить конфиг generic-аккаунта (endpointUrl, signatureAlgo, бренд) — колонка-jsonb на
   `payment_account` или отдельная таблица? (зависит от того, кто пилит persistence платежей).
2. SSRF-allowlist — глобальный список разрешённых хостов ПС или свободный ввод + блок private-ranges?
3. `PaymentCapabilitiesSchema` в shared дублирует домен-тип `PaymentCapabilities` — свести через
   `z.infer` (shared — источник) или оставить параллельно? Связано с вопросом промо `SecretVault`
   из ADR-0001.
