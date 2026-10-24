import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function supportedNode(version) {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  return (major === 22 && minor >= 18) || major === 24 || major === 26;
}
export function checkEnvironment({ version = process.version, run = spawnSync, native = true } = {}) {
  const errors = [];
  if (native && !supportedNode(version)) errors.push(`Node ${version} no está soportado. Usa Node 22.18+, 24 o 26; o ejecuta la demo con Docker sin Node local.`);
  const docker = run('docker', ['--version'], { encoding: 'utf8', timeout: 15000 });
  if (docker.error || docker.status !== 0) {
    errors.push('Falta Docker. Instala un motor compatible y Docker Compose: https://docs.docker.com/get-started/get-docker/');
    return errors;
  }
  const compose = run('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 15000 });
  if (compose.error || compose.status !== 0) errors.push('Falta Docker Compose v2.20+; actualiza tu instalación de Docker.');
  else {
    const [major, minor] = compose.stdout.trim().replace(/^v/, '').split('.').map(Number);
    if (!Number.isFinite(major) || (major < 2 || (major === 2 && minor < 20))) errors.push('Se requiere Docker Compose v2.20+ para esperar al estado healthy.');
  }
  const server = run('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 15000 });
  if (server.error || server.status !== 0) errors.push('El motor de Docker no está disponible. Abre Docker Desktop/OrbStack, espera a que arranque y repite docker info. Si el contexto apunta a otra instalación, consulta docker context ls. Este script no modifica el contexto.');
  return errors;
}
export function reportEnvironment(options) {
  const errors = checkEnvironment(options);
  for (const error of errors) console.error(`ERROR: ${error}`);
  if (!errors.length) console.log('Entorno listo: versión soportada y motor Docker disponible.');
  return !errors.length;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = reportEnvironment({ native: !process.argv.includes('--docker-only') }) ? 0 : 1;
