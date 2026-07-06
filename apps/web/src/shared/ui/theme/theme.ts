/** Дизайн-токены. Единственный источник цветов/отступов/радиусов для UI-kit. */
export const theme = {
  colors: {
    text: '#1a1a1a',
    textMuted: '#6b7280',
    bg: '#ffffff',
    surface: '#ffffff',
    border: '#e5e7eb',
    primary: '#1a1a1a',
    primaryText: '#ffffff',
    danger: '#b91c1c',
    /** Светлая подложка для опасных/блокирующих состояний (баннер read-only). */
    dangerSurface: '#fef2f2',
    link: '#2563eb',
  },
  /** Шаг сетки 4px: space(2) → 8px. */
  space: (n: number) => `${n * 4}px`,
  radii: {
    sm: '6px',
    md: '8px',
    lg: '12px',
  },
  fontSizes: {
    sm: '13px',
    md: '15px',
    lg: '20px',
    xl: '28px',
  },
  /** Контрольные точки адаптива (один UI на все экраны). */
  breakpoints: {
    md: '720px',
  },
  /** Константы каркаса приложения. */
  layout: {
    /** Высота верхней навигации — для полноэкранных раскладок (мессенджер-инбокс). */
    navHeight: '61px',
  },
} as const;

export type Theme = typeof theme;
