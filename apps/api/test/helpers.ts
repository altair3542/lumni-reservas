import { createDatabase, type Database } from '../src/db/client.js';
import { migrateDatabase } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
export function openTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL es obligatorio; usa una base aislada lumni_test');
  if (!/^lumni_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname.slice(1)))
    throw new Error('Se rechaza modificar una base que no sea lumni_test o lumni_test_<sufijo>');
  return createDatabase(url);
}
export async function prepareDatabase(database: Database) {
  await migrateDatabase(database);
}
export const demoPasswords = {
  clientPassword: 'ClienteDemo2026!',
  adminPassword: 'AdminDemo2026!',
};
export async function resetDatabase(database: Database) {
  // Solo se invoca después de la protección de nombre en openTestDatabase().
  await database.pool.query('TRUNCATE users, rooms, services CASCADE');
  await seedDatabase(database, { ...demoPasswords, now: new Date('2026-10-23T17:00:00Z') });
}
