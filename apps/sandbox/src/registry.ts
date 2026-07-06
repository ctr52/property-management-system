import type { Emulator } from './kit/types';
import { avitoEmulator } from './emulators/avito';
import { cianEmulator } from './emulators/cian';
import { robokassaEmulator } from './emulators/robokassa';
import { tochkaEmulator } from './emulators/tochka';

/**
 * Реестр эмуляторов. Каждая интеграция — свой порт и своя панель.
 * Добавить новую = новая папка в emulators/ + строка здесь.
 */
export const EMULATORS: readonly Emulator[] = [
  avitoEmulator,
  cianEmulator,
  robokassaEmulator,
  tochkaEmulator,
];
