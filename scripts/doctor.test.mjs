import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnvironment, supportedNode } from './doctor.mjs';

test('versiones soportadas sin rechazar Node 26', () => {
  for (const version of ['v22.18.0', '22.22.2', '24.22.1', '26.10.0']) assert.equal(supportedNode(version), true);
  for (const version of ['20.19.0', '22.17.9', '23.0.0', '25.0.0', '27.0.0']) assert.equal(supportedNode(version), false);
});
test('informa falta de Docker sin lanzar instalación ni cambiar contexto', () => {
  const calls = [];
  const errors = checkEnvironment({ version: '26.10.0', run: (command, args) => { calls.push([command, args]); return { status: 1 }; } });
  assert.equal(errors.length, 1); assert.match(errors[0], /Falta Docker/);
  assert.deepEqual(calls, [['docker', ['--version']]]);
});
test('detecta daemon apagado aunque la CLI esté instalada', () => {
  const errors = checkEnvironment({ version: '26.10.0', run: (_command, args) => args[0] === 'info' ? { status: 1 } : { status: 0, stdout: args[0] === 'compose' ? '5.1.2' : 'Docker' } });
  assert.equal(errors.length, 1); assert.match(errors[0], /motor de Docker no está disponible/);
});
test('rechaza Compose antiguo y admite el diagnóstico solo Docker', () => {
  const run = (_command, args) => ({ status: 0, stdout: args[0] === 'compose' ? '2.19.0' : 'ok' });
  assert.match(checkEnvironment({ version: '26.10.0', run })[0], /Compose v2.20/);
  const ready = (_command, args) => ({ status: 0, stdout: args[0] === 'compose' ? '2.20.0' : 'ok' });
  assert.deepEqual(checkEnvironment({ version: '20.0.0', run: ready, native: false }), []);
});
