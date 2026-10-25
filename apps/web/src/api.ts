import { errorResponseSchema, type Quote } from '@lumni/shared';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public suggestedSlot?: Quote['suggestedSlot'],
  ) {
    super(message);
  }
}
export async function apiRequest<T>(
  path: string,
  schema: { parse: (v: unknown) => T },
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  const signal = init.signal ?? AbortSignal.timeout(15000);
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      signal.aborted
        ? 'La solicitud tardó demasiado. Revisa tu reserva antes de volver a intentar.'
        : 'No pudimos conectarnos. Intenta de nuevo.',
    );
  }
  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) {
      const e = parsed.data.error;
      if (response.status === 401 && path !== '/me' && path !== '/auth/login')
        window.dispatchEvent(new Event('session-expired'));
      throw new ApiError(response.status, e.code, e.message, e.requestId, e.suggestedSlot);
    }
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'El servidor no pudo completar la solicitud',
    );
  }
  try {
    return schema.parse(body);
  } catch {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'La respuesta no tiene el formato esperado',
    );
  }
}
