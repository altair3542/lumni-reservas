import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from './api.js';
const schema = {
  parse: (value: unknown) => {
    if (!value || typeof value !== 'object' || !('ok' in value)) throw new Error('invalid');
    return value;
  },
};
afterEach(() => vi.unstubAllGlobals());
describe('Cliente HTTP', () => {
  it('incluye cookie y conserva body/método de la mutación', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/bookings', schema, { method: 'POST', body: '{"test":true}' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/bookings',
      expect.objectContaining({ method: 'POST', credentials: 'include', body: '{"test":true}' }),
    );
  });
  it('conserva código y alternativa del 409 para ofrecer otro horario', async () => {
    const suggestedSlot = {
      startsAt: '2026-10-26T10:00:00-05:00',
      endsAt: '2026-10-26T11:00:00-05:00',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'ROOM_UNAVAILABLE',
              message: 'Horario ocupado',
              requestId: '00000000-0000-4000-8000-000000000001',
              suggestedSlot,
            },
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(apiRequest('/bookings/id/confirm', schema)).rejects.toMatchObject({
      status: 409,
      code: 'ROOM_UNAVAILABLE',
      suggestedSlot,
    });
  });
  it('un 401 de ruta protegida solicita reautenticación y un login inválido conserva el formulario', async () => {
    const window = new EventTarget(),
      expired = vi.fn();
    window.addEventListener('session-expired', expired);
    vi.stubGlobal('window', window);
    const response = () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Inicia sesión',
            requestId: '00000000-0000-4000-8000-000000000001',
          },
        }),
        { status: 401 },
      );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => response()),
    );
    await expect(apiRequest('/bookings', schema)).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    await expect(apiRequest('/auth/login', schema)).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
  });
  it('distingue fallo de red de una respuesta exitosa con contrato inválido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiRequest('/rooms', schema)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(apiRequest('/rooms', schema)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
