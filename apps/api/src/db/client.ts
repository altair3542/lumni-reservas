import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof createDatabase>;
