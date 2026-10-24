import { copyFileSync, constants, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { reportEnvironment } from './doctor.mjs';
// Se ejecuta desde la raíz con pnpm dev:setup, después de instalar dependencias.
if (!reportEnvironment()) process.exit(1);
if (!existsSync('.env')) copyFileSync('.env.example', '.env', constants.COPYFILE_EXCL);
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const [command, args] of [
  ['docker', ['compose', 'up', '-d', '--wait', 'postgres']],
  [pnpm, ['db:setup']],
]) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) {
    console.error(
      'Preparación interrumpida. Revisa el error anterior; no se inició la aplicación.',
    );
    process.exit(result.status || 1);
  }
}
console.log('Base preparada. Ejecuta pnpm dev y abre http://localhost:5173');
