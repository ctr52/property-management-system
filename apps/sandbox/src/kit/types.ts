import type { Hono } from 'hono';

export type EmulatorKind = 'channel' | 'payment';

/** Контекст, который лаунчер передаёт каждому эмулятору. */
export type EmulatorContext = {
  /** База нашего бэкенда (куда эмулятор шлёт вебхуки/тянет фид). */
  readonly systemBase: string;
};

/**
 * Самодостаточный эмулятор интеграции: свой порт, своя панель, свои протокольные эндпоинты.
 * Добавить новую интеграцию = новая папка с таким объектом + строка в registry.ts.
 */
export type Emulator = {
  readonly id: string;
  readonly label: string;
  readonly port: number;
  readonly kind: EmulatorKind;
  /** Короткое описание для хаба. */
  readonly blurb: string;
  readonly accent: string;
  readonly createApp: (ctx: EmulatorContext) => Hono;
};
