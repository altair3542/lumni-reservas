import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('consultas.sql', root), 'utf8');
const statements = source
  .replace(/^--.*$/gm, '')
  .split(';')
  .map((sql) => sql.trim())
  .filter(Boolean);
assert.equal(statements.length, 4, 'Deben existir cuatro consultas y una respuesta comentada.');
assert.equal(
  (source.match(/CURRENT_TIMESTAMP/g) ?? []).length,
  2,
  'Revisar cómo congelar el reloj.',
);
const answer = source.slice(source.indexOf('-- 5.')).trim().split('\n');
assert.ok(
  answer.length <= 5 && answer.every((line) => line.startsWith('--')),
  'D05: máximo cinco líneas.',
);

function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    input,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Docker falló.');
  return result.stdout + result.stderr;
}

// Contenedor propio, sin puertos ni acceso a la red; no lee .env ni usa la BD de la app.
const name = `lumni-sql-check-${randomUUID()}`;
const container = name;
docker([
  'run',
  '--detach',
  '--rm',
  '--name',
  name,
  '--network',
  'none',
  '--label',
  'lumni.purpose=sql-part3-test',
  '-e',
  'POSTGRES_USER=lumni_sql',
  '-e',
  'POSTGRES_PASSWORD=sql-local-only',
  '-e',
  'POSTGRES_DB=lumni_sql_test',
  'postgres:16',
]);
let cleaned = false;
function cleanup(): void {
  if (cleaned) return;
  cleaned = true;
  docker(['rm', '--force', '--volumes', container]);
  console.log('Contenedor y volumen temporales retirados.');
}
process.once('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.once('SIGTERM', () => {
  cleanup();
  process.exit(143);
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        container,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'lumni_sql',
        '-d',
        'lumni_sql_test',
      ],
      {
        stdio: 'ignore',
        timeout: 5_000,
      },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    await setTimeout(250);
  }
  assert.ok(ready, 'PostgreSQL no estuvo listo en el plazo de preparación.');
  const schema = readFileSync(new URL('sql/schema.sql', root), 'utf8');
  const seed = readFileSync(new URL('sql/seed.sql', root), 'utf8');
  const checks = readFileSync(new URL('sql/assertions.sql', root), 'utf8');
  console.log(
    docker([
      'exec',
      container,
      'psql',
      '-X',
      '-U',
      'lumni_sql',
      '-d',
      'lumni_sql_test',
      '-Atc',
      'SELECT version()',
    ]).trim(),
  );
  let scenarios = 0;
  for (const now of ['2026-01-01T02:30:00Z', '2024-03-01T05:30:00Z']) {
    for (const zone of ['UTC', 'America/Bogota', 'Pacific/Auckland']) {
      const views = statements
        .map(
          (query, index) =>
            `CREATE TEMP VIEW actual_${index + 1} AS ${query.replace(/CURRENT_TIMESTAMP/g, `TIMESTAMPTZ '${now}'`)};`,
        )
        .join('\n');
      const script = `BEGIN; SET LOCAL TIME ZONE '${zone}';\n${schema}\n${seed}\n${views}\n${checks}\nROLLBACK;`;
      const output = docker(
        [
          'exec',
          '-i',
          container,
          'psql',
          '-X',
          '-q',
          '-v',
          'ON_ERROR_STOP=1',
          '-v',
          `reference_now=${now}`,
          '-U',
          'lumni_sql',
          '-d',
          'lumni_sql_test',
        ],
        script,
      );
      const notices = output
        .split('\n')
        .filter((line) => line.includes('NOTICE:'))
        .join('\n');
      console.log(`\nReloj=${now} TZ=${zone}\n${notices}`);
      scenarios++;
    }
  }
  // Ejecuta también el archivo intacto, con el reloj real, sobre fixtures transaccionales.
  docker(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'lumni_sql',
      '-d',
      'lumni_sql_test',
    ],
    `BEGIN;\n${schema}\n${seed}\n${source}\nROLLBACK;`,
  );
  console.log(
    `\n${scenarios} escenarios / 48 comprobaciones SQL: OK. Archivo original: OK. D05: ${answer.length} líneas.`,
  );
} finally {
  cleanup();
}
