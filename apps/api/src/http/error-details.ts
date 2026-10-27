export type ErrorDetails = { type: string; code?: string };
const nodeCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOENT',
  'EACCES',
  'ENOSPC',
]);

// Mensajes, stack, SQL, parámetros y cuerpos pueden contener datos privados.
export function errorDetails(error: unknown): ErrorDetails {
  const type =
    error instanceof TypeError
      ? 'TypeError'
      : error instanceof RangeError
        ? 'RangeError'
        : error instanceof SyntaxError
          ? 'SyntaxError'
          : error instanceof Error
            ? 'Error'
            : 'UnknownError';
  let current = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    if (
      'code' in current &&
      typeof current.code === 'string' &&
      (/^[0-9A-Z]{5}$/.test(current.code) || nodeCodes.has(current.code))
    )
      return { type, code: current.code };
    current = 'cause' in current ? current.cause : undefined;
  }
  return { type };
}
