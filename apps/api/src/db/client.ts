import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Настоящий PostgreSQL через PGlite (WASM) как npm-зависимость — без сервера/портов,
 * персистится в папку. Переезд на серверный Postgres = смена драйвера, схема та же.
 */
export const createDb = async () => {
  const dataDir = process.env.PG_DATA ?? resolve(here, '../../.data/pg');
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(here, '../../drizzle') });
  return db;
};

export type Db = Awaited<ReturnType<typeof createDb>>;
