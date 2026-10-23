import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(nodeScrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const [, salt, digest] = (encoded ?? '').split(':');
  const valid = !!salt && /^[a-f0-9]{128}$/.test(digest ?? '');
  const expected = valid ? Buffer.from(digest!, 'hex') : Buffer.alloc(64);
  const actual = await scrypt(password, salt ?? 'missing-user-dummy-salt', 64) as Buffer;
  return timingSafeEqual(actual, expected) && valid;
}
