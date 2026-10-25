import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { requireOwner } from '../src/auth/ownership.js';
import { readConfig } from '../src/config.js';
const databaseUrl = 'postgres://lumni:local-test@localhost/lumni_test';

describe('Permisos, hashes y cookies', () => {
  it('hashes con sal aleatoria verifican solo la contraseña correcta y formato scrypt esperado', async () => {
    const first = await hashPassword('PruebaA3!'),
      second = await hashPassword('PruebaA3!');
    expect(first).not.toBe(second);
    expect(await verifyPassword('PruebaA3!', first)).toBe(true);
    expect(await verifyPassword('incorrecta', first)).toBe(false);
    expect(await verifyPassword('PruebaA3!', first.replace('scrypt:', 'unknown:'))).toBe(false);
    expect(await verifyPassword('PruebaA3!', first + ':extra')).toBe(false);
    expect(await verifyPassword('PruebaA3!')).toBe(false);
  });
  it('requireOwner trata reserva ajena e inexistente como el mismo 404', () => {
    const row = { ownerId: 'owner' };
    expect(() => requireOwner('owner', row)).not.toThrow();
    for (const resource of [undefined, { ownerId: 'another' }])
      expect(() => requireOwner('owner', resource)).toThrowError(
        expect.objectContaining({ status: 404, code: 'BOOKING_NOT_FOUND' }),
      );
  });
  it('HTTPS activa cookies Secure también en desarrollo, HTTP local conserva demo funcional', () => {
    expect(
      readConfig({
        DATABASE_URL: databaseUrl,
        WEB_ORIGIN: 'https://localhost:5173',
        NODE_ENV: 'development',
      }).secureCookies,
    ).toBe(true);
    expect(
      readConfig({
        DATABASE_URL: databaseUrl,
        WEB_ORIGIN: 'http://localhost:5173',
        NODE_ENV: 'development',
      }).secureCookies,
    ).toBe(false);
    expect(
      readConfig({
        DATABASE_URL: databaseUrl,
        WEB_ORIGIN: 'https://demo.example',
        NODE_ENV: 'production',
      }).secureCookies,
    ).toBe(true);
  });
  it.each(['ftp://localhost', 'file:///tmp/site'])(
    'rechaza WEB_ORIGIN con protocolo no HTTP: %s',
    (origin) => {
      expect(() => readConfig({ DATABASE_URL: databaseUrl, WEB_ORIGIN: origin })).toThrow(
        'Configuración inválida',
      );
    },
  );
});
