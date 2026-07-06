import '@emotion/react';
import type { Theme as AppTheme } from './theme';

// Делаем нашу тему типом для props.theme и css-пропа во всём приложении.
declare module '@emotion/react' {
  export interface Theme extends AppTheme {}
}
