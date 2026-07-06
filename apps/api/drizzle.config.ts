import { defineConfig } from 'drizzle-kit';

// Генерация миграций из схемы (drizzle-kit generate). Подключение к БД здесь не нужно —
// миграции применяются на старте приложения через мигратор PGlite (src/db/client.ts).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
