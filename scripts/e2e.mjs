import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.E2E_BASE_URL;
const project = process.env.E2E_COMPOSE_PROJECT;
if (!base || !project || !/^lumni-(e2e|a4-check|a5-check|a6-check)(?:-[a-z0-9]+)?$/.test(project))
  throw new Error(
    'Usa E2E_BASE_URL y un proyecto Compose aislado lumni-e2e, lumni-a4-check o lumni-a5-check o lumni-a6-check. Nunca la base de desarrollo.',
  );
const url = new URL(base);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('La demo E2E debe publicarse en HTTP local.');
const published = execFileSync(
  'docker',
  ['compose', '--project-name', project, 'port', 'app', '3000'],
  { cwd: root, encoding: 'utf8' },
).trim();
const projectPort = published.split(':').at(-1);
if (!projectPort || projectPort !== (url.port || '80'))
  throw new Error(
    'E2E_BASE_URL no coincide con el puerto publicado por el proyecto Compose aislado.',
  );
let cookie;
async function api(path, data, method = data ? 'POST' : 'GET') {
  const response = await fetch(new URL(`/api${path}`, url), {
    method,
    headers: {
      Origin: url.origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) throw new Error(`Fixture E2E: ${method} ${path} devolvió ${response.status}`);
  const value = response.status === 204 ? null : await response.json();
  return { response, value };
}
const login = await api('/auth/login', {
  email: 'cliente@example.com',
  password: process.env.DEMO_CLIENT_PASSWORD ?? 'ClienteDemo2026!',
});
cookie = login.response.headers.get('set-cookie')?.split(';')[0];
const day = new Date();
day.setUTCDate(day.getUTCDate() + 70 + Math.floor(Math.random() * 200));
if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
const date = day.toISOString().slice(0, 10);
async function fixture(startTime) {
  let { booking } = (
    await api('/bookings', {
      clientRequestId: randomUUID(),
      customer: { fullName: 'Fixture correo E2E', email: 'fixture-e2e@example.com' },
    })
  ).value;
  ({ booking } = (
    await api(
      `/bookings/${booking.id}/draft`,
      {
        step: 2,
        expectedVersion: booking.version,
        roomId: '00000000-0000-4000-8000-000000000203',
        date,
        startTime,
        durationMinutes: 60,
      },
      'PATCH',
    )
  ).value);
  ({ booking } = (
    await api(
      `/bookings/${booking.id}/draft`,
      { step: 3, expectedVersion: booking.version, serviceCodes: [] },
      'PATCH',
    )
  ).value);
  ({ booking } = (
    await api(`/bookings/${booking.id}/confirm`, { expectedVersion: booking.version })
  ).value);
  return booking.id;
}
const failedBooking = await fixture('09:00'),
  sentBooking = await fixture('10:00');
for (const id of [failedBooking, sentBooking])
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
    throw new Error('ID de fixture inválido');
// Solo se modifican los eventos recién creados por esta ejecución en el Compose aislado.
const sql = `BEGIN;
SELECT id FROM email_outbox WHERE booking_id IN ('${failedBooking}','${sentBooking}') FOR UPDATE;
DELETE FROM captured_emails WHERE booking_id='${failedBooking}';
UPDATE email_outbox SET status='failed', attempts=6, last_error='Fallo controlado de captura E2E' WHERE booking_id='${failedBooking}';
INSERT INTO captured_emails (dedup_key,booking_id,to_email,subject,text_body)
SELECT dedup_key,booking_id,payload->>'toEmail',payload->>'subject',payload->>'textBody' FROM email_outbox WHERE booking_id='${sentBooking}' ON CONFLICT (booking_id) DO NOTHING;
UPDATE email_outbox SET status='sent', attempts=1, sent_at=now() WHERE booking_id='${sentBooking}';
COMMIT;
SELECT booking_id,id FROM email_outbox WHERE booking_id IN ('${failedBooking}','${sentBooking}');`;
const rows = execFileSync(
  'docker',
  [
    'compose',
    '--project-name',
    project,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'lumni',
    '-d',
    'lumni_app',
    '-tA',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ],
  { cwd: root, encoding: 'utf8' },
);
const ids = new Map(
  rows
    .trim()
    .split('\n')
    .filter((row) => row.includes('|'))
    .map((row) => row.split('|')),
);
const failedId = ids.get(failedBooking),
  sentId = ids.get(sentBooking);
if (!failedId || !sentId)
  throw new Error('No se encontraron los eventos del fixture en el proyecto aislado.');
await api('/auth/logout', {});
if (process.argv.includes('--fixtures-only')) {
  console.log(JSON.stringify({ failedId, sentId }));
} else {
  const result = spawnSync('pnpm', ['--filter', '@lumni/web', 'test:e2e'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, E2E_FAILED_EMAIL: failedId, E2E_SENT_EMAIL: sentId },
  });
  process.exit(result.status ?? 1);
}
