#!/usr/bin/env bash
# Запускается НА ВМ по SSH. Ставит Docker (если надо) и поднимает стенд.
# .env к этому моменту уже записан workflow'ом из GitHub Secret PROD_ENV.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/pms}"
cd "$APP_DIR"

# 1. Docker ставим при деплое, если его нет.
bash deploy/ensure-docker.sh

# 2. sudo — только если не root и нет прямого доступа к docker-сокету
#    (членство в группе docker применяется лишь при новом входе).
SUDO=""
if [ "$(id -u)" -ne 0 ] && ! docker info >/dev/null 2>&1; then
  SUDO="sudo"
fi

# 3. Сборка образов прямо на ВМ и запуск (без внешнего registry).
$SUDO docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

# 4. Чистим висящие слои, чтобы диск ВМ не пух от старых сборок.
$SUDO docker image prune -f

echo "[remote-deploy] готово. Статус:"
$SUDO docker compose -f docker-compose.prod.yml ps
