import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
test('demo se detiene con diagnóstico claro antes de compose up si el motor está apagado', { skip: process.platform === 'win32' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'lumni-doctor-'));
  const marker = join(directory, 'started');
  try {
    writeFileSync(join(directory, 'docker'), `#!/bin/sh\nif [ "$1" = compose ] && [ "$2" = version ]; then echo 5.1.2; exit 0; fi\nif [ "$1" = info ]; then exit 1; fi\nif [ "$3" = up ] || [ "$2" = up ]; then touch '${marker}'; fi\nexit 0\n`, { mode: 0o755 });
    const result = spawnSync('/bin/sh', ['scripts/demo.sh'], { cwd: root, env: { ...process.env, PATH: `${directory}:/usr/bin:/bin` }, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /motor de Docker no está disponible/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('URL interna de PostgreSQL conserva caracteres especiales sin imprimirlos en logs de arranque', () => {
  const password = 'demo@#:/?';
  const result = spawnSync(process.execPath, ['infra/docker/database-url.mjs', 'lumni_app'], { cwd: root, env: { ...process.env, PGPASSWORD: password }, encoding: 'utf8' });
  assert.equal(result.status, 0);
  const url = new URL(result.stdout);
  assert.equal(url.hostname, 'postgres'); assert.equal(url.pathname, '/lumni_app'); assert.equal(decodeURIComponent(url.password), password);
});
