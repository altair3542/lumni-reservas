import type { Config } from '../config.js';

const localHosts = new Set(['localhost', '127.0.0.1']);

export function isAllowedOrigin(origin: string | undefined, config: Config): boolean {
  if (!origin) return false;
  if (origin === config.webOrigin) return true;
  // Solo aliases HTTP de loopback en desarrollo. Nunca se amplían los orígenes de producción.
  if (!config.allowLocalOriginAliases || config.secureCookies) return false;
  try {
    const actual = new URL(origin);
    const expected = new URL(config.webOrigin);
    return (
      actual.origin === origin &&
      actual.protocol === 'http:' &&
      expected.protocol === 'http:' &&
      actual.port === expected.port &&
      localHosts.has(actual.hostname) &&
      localHosts.has(expected.hostname)
    );
  } catch {
    return false;
  }
}
