import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_CLIENT_ID, DEMO_ROOM_ID } from '../src/db/seed.js';
import { demoPasswords, openTestDatabase, prepareDatabase, resetDatabase } from './helpers.js';
import { verifyPassword } from '../src/auth/password.js';
const database = openTestDatabase();
const snapshot = {
  roomId: DEMO_ROOM_ID,
  startsAt: '2026-10-24T09:00:00-05:00',
  endsAt: '2026-10-24T10:00:00-05:00',
  timeZone: 'America/Bogota',
  currency: 'COP',
  pricingVersion: 'v1',
  breakdown: { base: 40000, discount: 0, surcharge: 10000, services: 0, total: 50000 },
  canBook: true,
  reasonCode: null,
  message: null,
  suggestedSlot: null,
};
const insert = `INSERT INTO bookings (owner_id,client_request_id,create_request_hash,status,customer,room_id,starts_at,ends_at,service_codes,quote_snapshot,confirmed_at)
 VALUES ($1,$2,'fixture','confirmed',$3,$4,$5,$6,'[]',$7,now()) RETURNING id`;
const values = (
  start = '2026-10-24T09:00:00-05:00',
  end = '2026-10-24T10:00:00-05:00',
  room = DEMO_ROOM_ID,
) => [
  DEMO_CLIENT_ID,
  randomUUID(),
  JSON.stringify({ fullName: 'Cliente', email: 'cliente@example.com' }),
  room,
  start,
  end,
  JSON.stringify({ ...snapshot, roomId: room, startsAt: start, endsAt: end }),
];
beforeAll(() => prepareDatabase(database));
beforeEach(() => resetDatabase(database));
afterAll(() => database.pool.end());
describe('Migración, invariantes y conexiones reales PostgreSQL', () => {
  it('reaplica sin cambios y registra la exclusión parcial GiST', async () => {
    await prepareDatabase(database);
    const [constraint] = (
      await database.pool.query(
        "SELECT contype, pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='bookings_no_overlap'",
      )
    ).rows;
    expect(constraint.contype).toBe('x');
    expect(constraint.definition).toContain('EXCLUDE USING gist');
    expect(constraint.definition).toContain("'[)'::text");
    expect(constraint.definition).toContain('completed');
    expect(
      (await database.pool.query('SELECT count(*)::int count FROM drizzle.__drizzle_migrations'))
        .rows[0].count,
    ).toBe(2);
  });
  it('guarda draft sin datos de sala/tiempo/precio; rechaza confirmarlo incompleto', async () => {
    const id = randomUUID();
    await database.pool.query(
      'INSERT INTO bookings (id,owner_id,client_request_id,create_request_hash) VALUES ($1,$2,$3,$4)',
      [id, DEMO_CLIENT_ID, randomUUID(), 'fixture'],
    );
    const [row] = (
      await database.pool.query(
        'SELECT room_id,starts_at,ends_at,quote_snapshot,service_codes FROM bookings WHERE id=$1',
        [id],
      )
    ).rows;
    expect(Object.values(row)).toEqual([null, null, null, null, null]);
    await expect(
      database.pool.query("UPDATE bookings SET status='confirmed' WHERE id=$1", [id]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'bookings_confirmed_complete' });
  });
  it('rechaza rangos cero/invertidos incluso para drafts', async () => {
    for (const end of ['2026-10-24T09:00:00-05:00', '2026-10-24T08:00:00-05:00'])
      await expect(
        database.pool.query(
          'INSERT INTO bookings (owner_id,client_request_id,create_request_hash,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5)',
          [DEMO_CLIENT_ID, randomUUID(), 'fixture', '2026-10-24T09:00:00-05:00', end],
        ),
      ).rejects.toMatchObject({ code: '23514' });
  });
  it('dos inserciones simultáneas en conexiones independientes: una gana y otra recibe 23P01', async () => {
    const connections = await Promise.all([database.pool.connect(), database.pool.connect()]);
    try {
      const outcomes = await Promise.allSettled(
        connections.map((connection) => connection.query(insert, values())),
      );
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find((o) => o.status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason.code).toBe('23P01');
      expect(
        (
          await database.pool.query(
            "SELECT count(*)::int count FROM bookings WHERE status='confirmed'",
          )
        ).rows[0].count,
      ).toBe(1);
    } finally {
      connections.forEach((connection) => connection.release());
    }
  });
  it('acepta extremos contiguos y salas distintas; completed también bloquea', async () => {
    const first = await database.pool.query(insert, values());
    await database.pool.query(
      insert,
      values('2026-10-24T10:00:00-05:00', '2026-10-24T11:00:00-05:00'),
    );
    await database.pool.query(
      insert,
      values(
        '2026-10-24T09:00:00-05:00',
        '2026-10-24T10:00:00-05:00',
        '00000000-0000-4000-8000-000000000202',
      ),
    );
    await database.pool.query("UPDATE bookings SET status='completed' WHERE id=$1", [
      first.rows[0].id,
    ]);
    await expect(database.pool.query(insert, values())).rejects.toMatchObject({ code: '23P01' });
  });
  it('draft y cancelled no bloquean; cancelar exige motivo', async () => {
    const first = await database.pool.query(insert, values());
    await expect(
      database.pool.query(
        "UPDATE bookings SET status='cancelled',cancelled_at=now(),cancellation_reason='  ' WHERE id=$1",
        [first.rows[0].id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await database.pool.query(
      "UPDATE bookings SET status='cancelled',cancelled_at=now(),cancellation_reason='Cambio de plan' WHERE id=$1",
      [first.rows[0].id],
    );
    await database.pool.query(insert, values());
  });
  it('contraseñas sembradas son hashes scrypt con sal propia', async () => {
    const rows = (await database.pool.query('SELECT email,password_hash FROM users ORDER BY email'))
      .rows;
    expect(rows[0].password_hash).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(rows[0].password_hash).not.toBe(rows[1].password_hash);
    const client = rows.find((r) => r.email === 'cliente@example.com');
    expect(await verifyPassword(demoPasswords.clientPassword, client.password_hash)).toBe(true);
    expect(await verifyPassword('incorrecta', client.password_hash)).toBe(false);
  });
  it('deduplica outbox, captura y líneas mediante claves únicas', async () => {
    const result = await database.pool.query(insert, values());
    const id = result.rows[0].id;
    const payload = JSON.stringify({
      toEmail: 'cliente@example.com',
      subject: 'Confirmación',
      textBody: 'Reserva',
    });
    await database.pool.query(
      'INSERT INTO email_outbox (booking_id,dedup_key,payload) VALUES ($1,$2,$3)',
      [id, `booking-confirmed:${id}`, payload],
    );
    await expect(
      database.pool.query(
        'INSERT INTO email_outbox (booking_id,dedup_key,payload) VALUES ($1,$2,$3)',
        [id, `booking-confirmed:${id}`, payload],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await database.pool.query(
      "INSERT INTO captured_emails (booking_id,dedup_key,to_email,subject,text_body) VALUES ($1,$2,'cliente@example.com','Confirmación','Reserva')",
      [id, `booking-confirmed:${id}`],
    );
    await expect(
      database.pool.query(
        "INSERT INTO captured_emails (booking_id,dedup_key,to_email,subject,text_body) VALUES ($1,$2,'cliente@example.com','Confirmación','Reserva')",
        [id, `booking-confirmed:${id}`],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await database.pool.query(
      "INSERT INTO booking_lines (booking_id,concept,amount_cop) VALUES ($1,'base',40000)",
      [id],
    );
    await expect(
      database.pool.query(
        "INSERT INTO booking_lines (booking_id,concept,amount_cop) VALUES ($1,'base',40000)",
        [id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
