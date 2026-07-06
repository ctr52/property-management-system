#!/usr/bin/env bash
#
# Настройка окружения для разработки на macOS:
#   1) удаляет системный Node из /usr/local (официальный установщик), ТОЛЬКО если он не из brew
#   2) ставит node + pnpm через Homebrew
#   3) показывает версии
#
# Запуск:  bash setup-macos.sh
#
set -euo pipefail

# --- Защита: только macOS (чтобы не запустить деструктив не туда) ---
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "✋ Этот скрипт только для macOS. Останавливаюсь."
  exit 1
fi

# --- Нужен Homebrew ---
if ! command -v brew >/dev/null 2>&1; then
  echo "✋ Не найден Homebrew. Установи его с https://brew.sh и запусти скрипт снова."
  exit 1
fi

echo "==> 1/3  Проверяю системный Node в /usr/local"
if [[ -e /usr/local/bin/node ]] && ! brew list --versions node >/dev/null 2>&1; then
  echo "    Найден системный Node (не из brew). Удаляю — потребуется пароль (sudo)."
  sudo rm -rf \
    /usr/local/bin/node \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/lib/node_modules \
    /usr/local/include/node \
    /usr/local/share/man/man1/node.1 \
    /usr/local/share/doc/node \
    /usr/local/share/systemtap/tapset/node.stp
  # Забыть receipt установщика, если был
  for p in $(pkgutil --pkgs 2>/dev/null | grep -i node || true); do
    sudo pkgutil --forget "$p" || true
  done
  hash -r
  echo "    ✅ Системный Node удалён."
else
  echo "    Системный Node в /usr/local не найден (или Node уже управляется brew) — пропускаю."
fi

echo "==> 2/3  Ставлю node + pnpm через brew"
brew install node pnpm

echo "==> 3/3  Версии"
echo "    node: $(node -v)"
echo "    npm:  $(npm -v)"
echo "    pnpm: $(pnpm -v)"
echo "    node путь: $(command -v node)"

echo
echo "✅ Готово. Дальше запусти проект:"
echo "     pnpm install"
echo "     pnpm dev        # API :3000 + web :5173 → http://localhost:5173"
