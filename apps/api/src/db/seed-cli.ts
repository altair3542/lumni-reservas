import { createDatabase } from './client.js';
import { readConfig } from '../config.js';
import { seedDatabase } from './seed.js';
import { seedDemoBookings } from './seed-demo.js';
const database = createDatabase(readConfig().databaseUrl);
try {
  const clientPassword = process.env.DEMO_CLIENT_PASSWORD;
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!clientPassword || !adminPassword) throw new Error('Define las contraseñas demo en .env');
  const enabled = process.env.SEED_DEMO_BOOKINGS ?? 'true';
  if (!['true', 'false'].includes(enabled))
    throw new Error('SEED_DEMO_BOOKINGS debe ser true o false');
  await seedDatabase(database, { clientPassword, adminPassword });
  console.log('Seed idempotente: 2 usuarios, 3 salas, 2 servicios y 1 draft demo');
  if ((process.env.NODE_ENV ?? 'development') === 'development' && enabled === 'true') {
    const result = await seedDemoBookings(database);
    console.log(
      `Reservas demo: ${result.created} nuevas, ${result.existing} conservadas, ${result.skipped} sin cupo`,
    );
  }
} finally {
  await database.pool.end();
}
