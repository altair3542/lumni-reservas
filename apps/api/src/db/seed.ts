import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { TIME_ZONE } from '@lumni/shared';
import type { Database } from './client.js';
import { bookings, rooms, services, users } from './schema.js';
import { hashPassword } from '../auth/password.js';
export const DEMO_CLIENT_ID = '00000000-0000-4000-8000-000000000101';
export const DEMO_ADMIN_ID = '00000000-0000-4000-8000-000000000102';
export const DEMO_ROOM_ID = '00000000-0000-4000-8000-000000000201';
export async function seedDatabase(database: Database, options: { clientPassword: string; adminPassword: string; now?: Date }) {
  if (options.clientPassword.length < 12 || options.adminPassword.length < 12) throw new Error('Contraseñas demo: mínimo 12 caracteres');
  const [clientHash, adminHash] = await Promise.all([hashPassword(options.clientPassword), hashPassword(options.adminPassword)]);
  let start = DateTime.fromJSDate(options.now ?? new Date(), { zone: TIME_ZONE }).plus({ days: 1 }).startOf('day').set({ hour: 9 });
  if (start.weekday === 7) start = start.plus({ days: 1 });
  const customer = { fullName: 'Cliente Demo', email: 'cliente@example.com' };
  await database.db.transaction(async tx => {
    await tx.insert(users).values([
      { id: DEMO_CLIENT_ID, email: customer.email, fullName: customer.fullName, role: 'client', passwordHash: clientHash },
      { id: DEMO_ADMIN_ID, email: 'admin@example.com', fullName: 'Administrador Demo', role: 'admin', passwordHash: adminHash },
    ]).onConflictDoNothing();
    await tx.insert(rooms).values([
      { id: DEMO_ROOM_ID, name: 'Sala pequeña', size: 'small', capacity: 4, hourlyRateCop: 40000 },
      { id: '00000000-0000-4000-8000-000000000202', name: 'Sala mediana', size: 'medium', capacity: 8, hourlyRateCop: 70000 },
      { id: '00000000-0000-4000-8000-000000000203', name: 'Sala grande', size: 'large', capacity: 16, hourlyRateCop: 120000 },
    ]).onConflictDoNothing();
    await tx.insert(services).values([{ code: 'projector', name: 'Proyector', flatPriceCop: 20000 }, { code: 'coffee', name: 'Café', flatPriceCop: 10000 }]).onConflictDoNothing();
    const clientRequestId = '00000000-0000-4000-8000-000000000301';
    const createRequestHash = createHash('sha256').update(JSON.stringify({ clientRequestId, customer })).digest('hex');
    await tx.insert(bookings).values({ ownerId: DEMO_CLIENT_ID, clientRequestId, createRequestHash, customer, roomId: DEMO_ROOM_ID, startsAt: start.toJSDate(), endsAt: start.plus({ hours: 1 }).toJSDate(), wizardStep: 3 }).onConflictDoNothing();
  });
}
