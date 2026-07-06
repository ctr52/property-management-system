import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // Включаем Emotion: css-проп + автоматический runtime.
      jsxImportSource: '@emotion/react',
      babel: { plugins: ['@emotion/babel-plugin'] },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // API ходит на Hono на 3000; на фронте обращаемся к /api.
      '/api': 'http://localhost:3000',
    },
  },
});
