import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
const client = {
  email: 'cliente@example.com',
  password: process.env.DEMO_CLIENT_PASSWORD ?? 'ClienteDemo2026!',
};
const admin = {
  email: 'admin@example.com',
  password: process.env.DEMO_ADMIN_PASSWORD ?? 'AdminDemo2026!',
};
const roomId = '00000000-0000-4000-8000-000000000201';
test('correo concatenado se bloquea sin autenticar ni enviar el formulario', async ({ page }) => {
  await page.goto('/#/ingresar');
  let loginRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/auth/login'))
      loginRequests += 1;
  });
  await page.getByLabel('Correo electrónico').fill('cliente@example.comadmin@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page.getByRole('heading', { name: 'Qué bueno verte' })).toBeVisible();
  expect(
    await page
      .getByLabel('Correo electrónico')
      .evaluate((element) => (element as HTMLInputElement).validity.valid),
  ).toBe(false);
  expect(loginRequests).toBe(0);
  expect((await page.request.get('/api/me')).status()).toBe(401);
});
function day(offset: number, saturday = false) {
  let value = DateTime.now().setZone('America/Bogota').plus({ days: offset });
  while (value.weekday === 7 || (saturday && value.weekday !== 6)) value = value.plus({ days: 1 });
  return value.toISODate()!;
}
async function login(page: Page, role: 'client' | 'admin' = 'client') {
  await page.goto('/#/ingresar');
  await page.getByLabel('Correo electrónico').fill((role === 'admin' ? admin : client).email);
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill((role === 'admin' ? admin : client).password);
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page).toHaveURL(role === 'admin' ? /admin\/reservas/ : /salas/);
}
async function logout(page: Page) {
  await page.getByRole('link', { name: 'Salir de mi cuenta' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Qué bueno verte' })).toBeVisible();
}
async function quoteDraft(page: Page, offset: number, saturday = false) {
  await page.getByLabel('Sala', { exact: true }).selectOption(roomId);
  await page.getByLabel('Fecha', { exact: true }).fill(day(offset, saturday));
  await page.getByLabel('Hora de inicio').selectOption('09:00');
  await page.getByLabel('Duración').selectOption('240');
  await page.getByLabel('Proyector').check();
  await page.getByRole('button', { name: 'Consultar disponibilidad' }).click();
  await expect(page.getByText('Horario disponible.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar con esta reserva' }).click();
  await expect(page.getByLabel('Nombre de contacto')).toBeVisible();
  return page.url().split('/reservas/')[1]!;
}
async function finishSteps(page: Page, name: string) {
  await page.getByLabel('Nombre de contacto').fill(name);
  await page.getByRole('button', { name: 'Guardar y continuar', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'El momento y el lugar.' })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar horario y continuar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Los detalles hacen la diferencia.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Guardar servicios y revisar precio' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar reserva', exact: false })).toBeEnabled();
}
async function json(
  request: APIRequestContext,
  path: string,
  data?: object,
  method: 'get' | 'post' | 'patch' = data ? 'post' : 'get',
) {
  const response = await request[method](path, {
    headers: { Origin: process.env.E2E_BASE_URL! },
    ...(data ? { data } : {}),
  });
  expect(response.ok(), `${method} ${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}
async function ready(
  request: APIRequestContext,
  date: string,
  startTime = '09:00',
  durationMinutes = 240,
) {
  let { booking } = await json(request, '/api/bookings', {
    clientRequestId: crypto.randomUUID(),
    customer: { fullName: 'Competidor E2E', email: 'competidor@example.com' },
  });
  ({ booking } = await json(
    request,
    `/api/bookings/${booking.id}/draft`,
    { step: 2, expectedVersion: booking.version, roomId, date, startTime, durationMinutes },
    'patch',
  ));
  ({ booking } = await json(
    request,
    `/api/bookings/${booking.id}/draft`,
    { step: 3, expectedVersion: booking.version, serviceCodes: [] },
    'patch',
  ));
  return booking;
}

test('cliente cotiza sábado, guarda, confirma y admin consulta/cancela sin cambiar el precio', async ({
  page,
}) => {
  await login(page);
  const id = await quoteDraft(page, 14, true);
  await finishSteps(page, 'Encuentro completo');
  await expect(page.locator('.breakdown .total')).toContainText('200.000');
  await page.getByRole('button', { name: 'Confirmar reserva', exact: false }).click();
  const confirmation = page.getByRole('button', { name: 'Sí, confirmar reserva' });
  await expect(confirmation).toBeFocused();
  await confirmation.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Seguir revisando' })).toBeFocused();
  await page.getByRole('button', { name: 'Seguir revisando' }).press('Tab');
  await expect(confirmation).toBeFocused();
  await confirmation.click();
  await expect(page.getByRole('heading', { name: 'Tu encuentro está confirmado.' })).toBeVisible();
  const confirmed = (await json(page.request, `/api/bookings/${id}`)).booking;
  expect(confirmed.quoteSnapshot.breakdown.total).toBe(200000);
  await logout(page);
  await login(page, 'admin');
  await page.goto(`/#/admin/reservas/${id}`);
  await expect(page.getByRole('heading', { name: 'Capturado', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByRole('button', { name: 'Marcar como completada' })).toBeDisabled();
  await expect(page.locator('.email-body')).toContainText('200000 COP');
  await page.getByLabel('Motivo de cancelación').fill('Cambio acordado en la prueba');
  await page.getByRole('button', { name: 'Cancelar reserva', exact: true }).click();
  await expect(
    page.getByText('Reserva cancelada. El horario vuelve a estar disponible.'),
  ).toBeVisible();
  await expect(page.locator('.badge.cancelled')).toHaveText('Cancelada');
  await expect(page.locator('.breakdown .total')).toContainText('200.000');
  expect((await json(page.request, `/api/admin/bookings/${id}`)).booking.cancellationReason).toBe(
    'Cambio acordado en la prueba',
  );
});

test('retoma datos y horario al cerrar navegador, limpiar almacenamiento e ingresar de nuevo', async ({
  page,
  browser,
}) => {
  await login(page);
  const id = await quoteDraft(page, 22);
  await page.getByLabel('Nombre de contacto').fill('Retoma de borrador');
  await page.getByLabel('Empresa').fill('Empresa que se conserva');
  await page.getByRole('button', { name: 'Guardar y continuar', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'El momento y el lugar.' })).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.close();
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL!,
    timezoneId: 'Pacific/Auckland',
  });
  const resumed = await context.newPage();
  await login(resumed);
  await resumed.goto(`/#/reservas/${id}`);
  await resumed.getByRole('button', { name: '1 Tus datos' }).click();
  await expect(resumed.getByLabel('Nombre de contacto')).toHaveValue('Retoma de borrador');
  await expect(resumed.getByLabel('Empresa')).toHaveValue('Empresa que se conserva');
  await resumed.getByRole('button', { name: '2 Sala y horario' }).click();
  await expect(resumed.getByLabel('Fecha', { exact: true })).toHaveValue(day(22));
  await expect(resumed.getByLabel('Hora de inicio')).toHaveValue('09:00');
  await context.close();
});

test('fallo de red conserva campos y un guardado en vuelo bloquea avanzar', async ({ page }) => {
  await login(page);
  await quoteDraft(page, 25);
  await page.getByLabel('Nombre de contacto').fill('No perder estos datos');
  await page.route('**/api/bookings/*/draft', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Guardar y continuar', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('No pudimos conectarnos');
  await expect(page.getByLabel('Nombre de contacto')).toHaveValue('No perder estos datos');
  await page.unroute('**/api/bookings/*/draft');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/bookings/*/draft', async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Guardar y continuar', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '2 Sala y horario' })).toBeDisabled();
  release();
  await expect(page.getByRole('heading', { name: 'El momento y el lugar.' })).toBeVisible();
});

test('versión vieja informa conflicto y solo recarga al elegir descartar la edición', async ({
  page,
}) => {
  await login(page);
  const id = await quoteDraft(page, 28);
  await page.getByLabel('Nombre de contacto').fill('Edición local que no se pisa');
  const { booking } = await json(page.request, `/api/bookings/${id}`);
  await json(
    page.request,
    `/api/bookings/${id}/draft`,
    {
      step: 1,
      expectedVersion: booking.version,
      customer: { fullName: 'Otro dispositivo', email: client.email },
    },
    'patch',
  );
  await page.getByRole('button', { name: 'Guardar y continuar', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('cambios más recientes');
  await expect(page.getByLabel('Nombre de contacto')).toHaveValue('Edición local que no se pisa');
  await page
    .getByRole('button', { name: 'Cargar versión guardada y descartar esta edición' })
    .click();
  await page.getByRole('button', { name: '1 Tus datos' }).click();
  await expect(page.getByLabel('Nombre de contacto')).toHaveValue('Otro dispositivo');
});

test('colisión al confirmar muestra alternativa y permite revisar otro horario real', async ({
  page,
}) => {
  await login(page);
  await quoteDraft(page, 31);
  await finishSteps(page, 'Conflicto de horario');
  const competitor = await ready(page.request, day(31));
  await json(page.request, `/api/bookings/${competitor.id}/confirm`, {
    expectedVersion: competitor.version,
  });
  await page.getByRole('button', { name: 'Confirmar reserva', exact: false }).click();
  await page.getByRole('button', { name: 'Sí, confirmar reserva' }).click();
  await expect(page.getByText('Ese horario acaba de ocuparse.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar este horario' }).click();
  await expect(page.getByLabel('Hora de inicio')).toHaveValue('13:00');
  await page.getByRole('button', { name: 'Guardar horario y continuar' }).click();
  await page.getByRole('button', { name: 'Guardar servicios y revisar precio' }).click();
  await page.getByRole('button', { name: 'Confirmar reserva', exact: false }).click();
  await page.getByRole('button', { name: 'Sí, confirmar reserva' }).click();
  await expect(page.getByRole('heading', { name: 'Tu encuentro está confirmado.' })).toBeVisible();
});

test('sesión invalidada permite reingresar y conserva la edición en memoria', async ({
  page,
  request,
}) => {
  await login(page);
  const id = await quoteDraft(page, 34);
  const { booking } = await json(page.request, `/api/bookings/${id}`);
  await page.getByLabel('Nombre de contacto').fill('Edición tras sesión expirada');
  await page.request.post('/api/auth/logout', { headers: { Origin: process.env.E2E_BASE_URL! } });
  await page.getByRole('button', { name: 'Guardar y continuar', exact: false }).click();
  const dialog = page.getByRole('dialog', { name: 'Sesión terminada' });
  await expect(dialog).toBeVisible();
  await json(request, '/api/auth/login', client);
  await json(
    request,
    `/api/bookings/${id}/draft`,
    {
      step: 1,
      expectedVersion: booking.version,
      customer: { fullName: 'Cambio de otro navegador', email: client.email },
    },
    'patch',
  );
  await dialog.getByLabel('Correo electrónico').fill(client.email);
  await dialog.getByLabel('Contraseña', { exact: true }).fill(client.password);
  await dialog.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Nombre de contacto')).toHaveValue('Edición tras sesión expirada');
  await page.getByRole('button', { name: 'Guardar y continuar', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('cambios más recientes');
  await expect(page.getByLabel('Nombre de contacto')).toHaveValue('Edición tras sesión expirada');
  await page
    .getByRole('button', { name: 'Cargar versión guardada y descartar esta edición' })
    .click();
  await page.getByRole('button', { name: '1 Tus datos' }).click();
  await expect(page.getByLabel('Nombre de contacto')).toHaveValue('Cambio de otro navegador');
});

test('navegar con cambios pendientes ofrece conservar o descartar explícitamente', async ({
  page,
}) => {
  await login(page);
  const id = await quoteDraft(page, 37);
  await page.getByLabel('Empresa').fill('Cambio sin guardar');
  await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Hay cambios sin guardar' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.getByLabel('Empresa')).toHaveValue('Cambio sin guardar');
  await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
  await page.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Encuentros por venir.' })).toBeVisible();
  await page.goto(`/#/reservas/${id}`);
  await expect(page.getByLabel('Empresa')).toHaveValue('');
});

test('admin pagina más de 20 resultados y combina filtros; cliente recibe 403 real', async ({
  page,
  request,
}) => {
  await json(request, '/api/auth/login', client);
  for (let index = 0; index < 23; index++) {
    const { booking } = await json(request, '/api/bookings', {
      clientRequestId: crypto.randomUUID(),
      customer: { fullName: `Paginación ${index}` },
    });
    await json(
      request,
      `/api/bookings/${booking.id}/draft`,
      {
        step: 2,
        expectedVersion: booking.version,
        roomId: index % 2 ? roomId : '00000000-0000-4000-8000-000000000202',
        date: day(40),
        startTime: '09:00',
        durationMinutes: 60,
      },
      'patch',
    );
  }
  expect((await request.get('/api/admin/bookings')).status()).toBe(403);
  await login(page, 'admin');
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText(/Página 2 de/)).toBeVisible();
  await page.getByLabel('Filtrar por estado').selectOption('draft');
  await page.getByLabel('Filtrar por sala').selectOption('00000000-0000-4000-8000-000000000202');
  const expected = await json(
    page.request,
    '/api/admin/bookings?status=draft&roomId=00000000-0000-4000-8000-000000000202',
  );
  await expect(page.getByText(`${expected.total} resultados · Página 1 de 1`)).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(expected.items.length);
  await expect(page.locator('tbody')).not.toContainText('Confirmada');
});

test('diseño móvil mantiene formularios y navegación dentro de la pantalla', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole('navigation')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await quoteDraft(page, 43);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('admin inspecciona errores y capturas reales del fixture aislado', async ({ page }) => {
  test.skip(
    !process.env.E2E_FAILED_BOOKING || !process.env.E2E_SENT_BOOKING,
    'Configura los IDs de fixtures de correo de la demo aislada.',
  );
  await login(page, 'admin');
  await page.goto(`/#/admin/reservas/${process.env.E2E_FAILED_BOOKING}`);
  await expect(page.getByRole('heading', { name: 'Fallido', exact: true })).toBeVisible();
  await expect(page.getByText('Fallo controlado de captura E2E')).toBeVisible();
  await page.goto(`/#/admin/reservas/${process.env.E2E_SENT_BOOKING}`);
  await expect(
    page.getByRole('heading', { name: 'Confirmación capturada', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.email-body')).toContainText('COP');
  await expect(page.getByRole('link', { name: 'Correos', exact: true })).toHaveCount(0);
});
