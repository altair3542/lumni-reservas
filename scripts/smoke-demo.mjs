import assert from 'node:assert/strict';

const base = process.env.DEMO_URL ?? 'http://localhost:8080';
const request = (path, options = {}) => fetch(`${base}${path}`, options);
const health = await request('/api/health');
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'ok', database: 'up' });
const page = await request('/');
assert.equal(page.status, 200);
assert.match(await page.text(), /Lumni/);
for (const [email, password, role] of [
  ['cliente@example.com', process.env.DEMO_CLIENT_PASSWORD ?? 'ClienteDemo2026!', 'client'],
  ['admin@example.com', process.env.DEMO_ADMIN_PASSWORD ?? 'AdminDemo2026!', 'admin'],
]) {
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.role, role);
  const cookie = login.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie);
  const profile = await request('/api/me', { headers: { Cookie: cookie } });
  assert.equal(profile.status, 200); assert.equal((await profile.json()).user.role, role);
  const rooms = await request('/api/rooms', { headers: { Cookie: cookie } });
  assert.equal(rooms.status, 200); assert.equal((await rooms.json()).items.length, 3);
  const logout = await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: base } });
  assert.equal(logout.status, 204);
  assert.equal((await request('/api/me', { headers: { Cookie: cookie } })).status, 401);
  console.log(`Smoke HTTP: ${role}, login/perfil/catálogo/logout correctos`);
}
console.log('Demo HTTP verificada: HTML, salud y PostgreSQL disponibles');
