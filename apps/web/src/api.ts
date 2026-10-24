import { errorResponseSchema } from '@lumni/shared';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
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
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No pudimos conectarnos. Intenta de nuevo.');
  }
  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiError(response.status, e.code, e.message, e.requestId);
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
