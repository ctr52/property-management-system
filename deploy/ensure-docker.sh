#!/usr/bin/env bash
# Ставит Docker Engine + compose-плагин, если их ещё нет. Идемпотентно.
# Вызывается на ВМ во время деплоя — ручная подготовка машины не нужна.
set -euo pipefail

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

if command -v docker >/dev/null 2>&1 && $SUDO docker compose version >/dev/null 2>&1; then
  echo "[ensure-docker] уже установлен: $(docker --version)"
  exit 0
fi

echo "[ensure-docker] ставлю Docker Engine + compose…"
# Официальный установочный скрипт Docker (Debian/Ubuntu/CentOS/Alma и т.д.).
curl -fsSL https://get.docker.com | $SUDO sh
$SUDO systemctl enable --now docker
# Чтобы docker работал без sudo при следующих входах (в текущей сессии ещё нужен sudo).
$SUDO usermod -aG docker "${USER:-$(id -un)}" || true

echo "[ensure-docker] готово: $(docker --version)"
