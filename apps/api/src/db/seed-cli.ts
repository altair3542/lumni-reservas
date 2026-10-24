import { createDatabase } from './client.js';
import { readConfig } from '../config.js';
import { seedDatabase } from './seed.js';
const database = createDatabase(readConfig().databaseUrl);
try {
  const clientPassword = process.env.DEMO_CLIENT_PASSWORD;
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!clientPassword || !adminPassword) throw new Error('Define las contraseñas demo en .env');
  await seedDatabase(database, { clientPassword, adminPassword });
  console.log('Seed idempotente: 2 usuarios, 3 salas, 2 servicios y 1 draft demo');
} finally {
  await database.pool.end();
}
