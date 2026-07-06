# Деплой на cloud.ru через GitHub Actions

Демо-стенд PMS: одна ВМ, Docker Compose, эмуляторы площадок/платежей внутри.
Сборка образов идёт **прямо на ВМ** (без внешнего registry). Всё, что нужно на
машине (Docker), ставится автоматически при первом деплое.

## Схема

```
push в main ──► Actions: install → typecheck → test  (гейт качества)
             └► ssh на ВМ:
                  1. rsync кода в ~/pms
                  2. запись ~/pms/.env из секрета PROD_ENV
                  3. ensure-docker.sh (ставит Docker, если нет)
                  4. docker compose up -d --build

ВМ (одна docker-сеть):
  web  :80   — SPA + reverse-proxy /api → api:3000   (наружу)
  api  :3000 — Hono + PGlite, том pgdata (данные переживают релизы)
  sandbox    — эмуляторы Avito/Cian/Robokassa/Tochka  (только внутри)
```

## Что нужно один раз настроить

### 1. GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Что это |
|---|---|
| `SSH_HOST` | IP (или домен) cloud.ru ВМ |
| `SSH_USER` | пользователь ВМ (напр. `ubuntu`) |
| `SSH_PRIVATE_KEY` | приватный ключ, чей публичный добавлен в ВМ (весь файл `id_ed25519`) |
| `PROD_ENV` | содержимое `.env` для прода — по шаблону `.env.prod.example` |

Для деплой-ключа лучше завести **отдельную** пару (не переиспользовать личную):
`ssh-keygen -t ed25519 -f ~/.ssh/pms_deploy -C "gh-actions"`, публичную часть
(`pms_deploy.pub`) добавить в ВМ на cloud.ru, приватную (`pms_deploy`) — в секрет
`SSH_PRIVATE_KEY`.

### 2. cloud.ru: security group

Открыть входящие порты: **22** (SSH), **80** (HTTP). Порт **443** — когда появится
домен и HTTPS. Порты эмуляторов (4000–4011) наружу открывать НЕ нужно.

### 3. Запуск

Пуш в `main` (или Actions → deploy → Run workflow). Первый прогон дольше:
ставится Docker и собираются образы. После — открой `http://<IP>`.

## Обновления и откат

- Обновление — просто новый пуш в `main`. `.data/pg` в томе `pgdata` не трогается.
- Логи: `ssh user@host 'cd ~/pms && docker compose -f docker-compose.prod.yml logs -f api'`
- Бэкап БД: скопировать том `pgdata` (`docker run --rm -v pms_pgdata:/d -v $PWD:/b busybox tar czf /b/pg.tgz -C /d .`).

## Когда пойдут реальные интеграции

Эмуляторы — временный демо-режим. С реальными ключами площадок:
1. убрать сервис `sandbox` из `docker-compose.prod.yml`;
2. переставить `AVITO_API_BASE`/`CIAN_API_BASE`/… на боевые адреса;
3. завести домен (A-запись на IP), в `Caddyfile` заменить `:80` на домен — Caddy
   сам поднимет HTTPS; открыть 443 в security group. HTTPS обязателен для входящих
   вебхуков реальных YooKassa/Avito/Cian.
