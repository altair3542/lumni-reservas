import { test, expect, type Page } from '@playwright/test';
import { DateTime } from 'luxon';
import type { Conversation } from '@lumni/shared';

async function login(page: Page) {
  await page.goto('/#/ingresar');
  await page.getByLabel('Correo electrónico').fill('cliente@example.com');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(process.env.DEMO_CLIENT_PASSWORD ?? 'ClienteDemo2026!');
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page).toHaveURL(/salas/);
}
async function api(page: Page, path: string, data: object, method = 'POST') {
  const result = await page.request.fetch(`/api${path}`, {
    method,
    headers: { Origin: process.env.E2E_BASE_URL! },
    data,
  });
  expect(result.ok()).toBeTruthy();
  return result.json();
}
function initial(): Conversation {
  const instant = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    version: 1,
    slots: {},
    draftBookingId: null,
    messages: [],
    createdAt: instant,
    updatedAt: instant,
  };
}

// Estas pruebas simulan únicamente el contrato HTTP del chat para verificar la UI.
// La orquestación/persistencia real usa PostgreSQL en assistant.test.ts; no representan una demo del LLM.
test('UI chat con API simulada: conserva historial al recargar y abre un draft real', async ({
  page,
}) => {
  await login(page);
  let day = DateTime.now().setZone('America/Bogota').plus({ days: 90 });
  if (day.weekday === 7) day = day.plus({ days: 1 });
  const date = day.toISODate()!;
  let { booking } = await api(page, '/bookings', {
    clientRequestId: crypto.randomUUID(),
    customer: { fullName: 'Chat UI', email: 'chat-ui@example.com' },
  });
  ({ booking } = await api(
    page,
    `/bookings/${booking.id}/draft`,
    {
      step: 2,
      expectedVersion: booking.version,
      roomId: '00000000-0000-4000-8000-000000000202',
      date,
      startTime: '09:00',
      durationMinutes: 120,
    },
    'PATCH',
  ));
  ({ booking } = await api(
    page,
    `/bookings/${booking.id}/draft`,
    { step: 3, expectedVersion: booking.version, serviceCodes: ['projector'] },
    'PATCH',
  ));
  const conversation = initial();
  let turn = 0;
  await page.route('**/api/chat/conversations**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname.endsWith('/conversations'))
      return route.fulfill({
        json: {
          items: conversation.messages.length
            ? [
                {
                  id: conversation.id,
                  draftBookingId: conversation.draftBookingId,
                  updatedAt: conversation.updatedAt,
                },
              ]
            : [],
        },
      });
    if (url.pathname.endsWith('/messages')) {
      const body = req.postDataJSON();
      turn++;
      conversation.version++;
      conversation.messages.push({
        id: crypto.randomUUID(),
        role: 'user',
        kind: 'message',
        content: body.content,
        clientMessageId: body.clientMessageId,
        card: null,
        createdAt: new Date().toISOString(),
      });
      const card =
        turn === 3
          ? { quote: booking.quoteSnapshot, roomName: 'Sala mediana', draftBookingId: booking.id }
          : null;
      if (card) conversation.draftBookingId = booking.id;
      conversation.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        kind: null,
        content:
          turn === 1
            ? '¿A qué hora exacta quieres comenzar?'
            : turn === 2
              ? '¿Cuánto tiempo necesitas?'
              : 'Preparé tu borrador. Revisa los datos antes de confirmar.',
        clientMessageId: null,
        card,
        createdAt: new Date().toISOString(),
      });
    }
    return route.fulfill({ json: { conversation } });
  });
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Asistente de reservas' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Hablar con Lumni' }).click();
  await expect(page).toHaveURL(/salas/);
  await page
    .getByLabel('Sala', { exact: true })
    .selectOption('00000000-0000-4000-8000-000000000202');
  if (process.env.E2E_OUTPUT_DIR)
    await page.screenshot({
      path: `${process.env.E2E_OUTPUT_DIR}/assistant-desktop.png`,
      fullPage: false,
      animations: 'disabled',
    });
  for (const content of [
    '6 personas el sábado en la mañana con proyector',
    '09:00',
    '2 horas <img src=x onerror=alert(1)>',
  ]) {
    await page.getByLabel('Tu mensaje').fill(content);
    if (content === '09:00') await page.getByLabel('Tu mensaje').press('Enter');
    else await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByLabel('Tu mensaje')).toHaveValue('');
  }
  await expect(page.getByRole('region', { name: 'Cotización de tu reserva' })).toBeVisible();
  await expect(page.getByRole('button', { name: /confirmar/i })).toHaveCount(0);
  await expect(page.locator('.assistant-message img')).toHaveCount(0);
  if (process.env.E2E_OUTPUT_DIR)
    await page.screenshot({
      path: `${process.env.E2E_OUTPUT_DIR}/assistant-quote.png`,
      fullPage: false,
      animations: 'disabled',
    });
  await page.getByLabel('Tu mensaje').fill('Quiero añadir café');
  await page.getByRole('button', { name: 'Minimizar asistente' }).click();
  await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
  await page.getByRole('button', { name: 'Hablar con Lumni' }).click();
  await expect(page.getByLabel('Tu mensaje')).toHaveValue('Quiero añadir café');
  await page.getByLabel('Tu mensaje').fill('');
  await page.reload();
  await expect(
    page.getByText('6 personas el sábado en la mañana con proyector', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.assistant-message')).toHaveCount(6);
  await page.getByRole('button', { name: 'Nueva', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Qué tienes en mente?' })).toBeVisible();
  await page.getByRole('button', { name: 'Conversaciones', exact: true }).click();
  await page.getByRole('button', { name: /Encuentro del/ }).click();
  await expect(page.locator('.assistant-message')).toHaveCount(6);
  await page.getByRole('link', { name: 'Revisar borrador' }).click();
  await expect(page.getByRole('dialog', { name: 'Asistente de reservas' })).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/reservas/${booking.id}`));
  expect(
    (await page.request.get(`/api/bookings/${booking.id}`).then((r) => r.json())).booking.status,
  ).toBe('draft');
});

test('UI chat con API simulada: error de proveedor conserva texto e ID para reintentar', async ({
  page,
}) => {
  await login(page);
  const conversation = initial();
  const requests: { clientMessageId: string }[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/chat/conversations**', async (route) => {
    if (
      route.request().method() === 'GET' &&
      new URL(route.request().url()).pathname.endsWith('/conversations')
    )
      return route.fulfill({ json: { items: [] } });
    if (route.request().url().endsWith('/messages')) {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) await gate;
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'AI_UNAVAILABLE',
            message: 'El asistente no está disponible ahora.',
            requestId: crypto.randomUUID(),
          },
        },
      });
    }
    return route.fulfill({ json: { conversation } });
  });
  await page.getByRole('button', { name: 'Hablar con Lumni' }).click();
  await page.getByLabel('Tu mensaje').fill('Necesito una sala');
  let creates = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/chat/conversations')) creates++;
  });
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    if (i === 0) {
      await expect(page.getByText('Revisando tu solicitud…', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Minimizar asistente' }).click();
      await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
      await page.getByRole('button', { name: 'Hablar con Lumni' }).click();
      await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
      release();
    }
    await expect(
      page.getByText('El asistente no está disponible ahora.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Tu mensaje')).toHaveValue('Necesito una sala');
    await page.getByRole('button', { name: 'Minimizar asistente' }).click();
    await page.getByRole('button', { name: 'Hablar con Lumni' }).click();
  }
  expect(requests).toHaveLength(2);
  expect(creates).toBe(1);
  expect(requests[0]?.clientMessageId).toBe(requests[1]?.clientMessageId);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('burbuja móvil: conserva el texto al minimizar, contiene el foco y no desborda', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  let sends = 0;
  await page.route('**/api/chat/conversations**', async (route) => {
    if (route.request().method() === 'POST') sends++;
    await route.fulfill({ json: { items: [] } });
  });
  const launcher = page.getByRole('button', { name: 'Hablar con Lumni' });
  await launcher.click();
  const panel = page.getByRole('dialog', { name: 'Asistente de reservas' });
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  await page.getByLabel('Tu mensaje').fill('Quiero una sala');
  await page.getByLabel('Tu mensaje').press('Shift+Enter');
  await expect(page.getByLabel('Tu mensaje')).toHaveValue('Quiero una sala\n');
  const close = page.getByRole('button', { name: 'Minimizar asistente' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  expect(
    await page.locator('.workspace-body').evaluate((element) => (element as HTMLElement).inert),
  ).toBe(true);
  if (process.env.E2E_OUTPUT_DIR)
    await page.screenshot({
      path: `${process.env.E2E_OUTPUT_DIR}/assistant-mobile.png`,
      fullPage: false,
      animations: 'disabled',
    });
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
  expect(
    await page.locator('.workspace-body').evaluate((element) => (element as HTMLElement).inert),
  ).toBe(false);
  await launcher.click();
  await expect(page.getByLabel('Tu mensaje')).toHaveValue('Quiero una sala\n');
  expect(sends).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('enlaces anteriores abren el panel en salas y el administrador no ve burbuja', async ({
  page,
}) => {
  await login(page);
  const conversation = initial();
  await page.route('**/api/chat/conversations**', async (route) => {
    await route.fulfill({
      json: route.request().url().endsWith('/conversations') ? { items: [] } : { conversation },
    });
  });
  await page.goto(`/#/asistente/${conversation.id}`);
  await expect(page).toHaveURL(/salas/);
  await expect(page.getByRole('dialog', { name: 'Asistente de reservas' })).toBeVisible();
  await page.getByRole('button', { name: 'Minimizar asistente' }).click();
  await page.getByRole('link', { name: 'Salir de mi cuenta' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByLabel('Correo electrónico').fill('admin@example.com');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(process.env.DEMO_ADMIN_PASSWORD ?? 'AdminDemo2026!');
  await page.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await expect(page).toHaveURL(/admin\/reservas/);
  await expect(page.getByRole('button', { name: 'Hablar con Lumni' })).toHaveCount(0);
});
