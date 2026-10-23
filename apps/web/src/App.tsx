import { useEffect, useState, type FormEvent } from 'react';
import { healthSchema, loginResponseSchema, loginSchema, roomListSchema, type User } from '@lumni/shared';
import { ApiError, apiRequest } from './api.js';
type Room = ReturnType<typeof roomListSchema.parse>['items'][number];
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [ready, setReady] = useState(false);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    let active = true;
    void apiRequest('/health', healthSchema).then(() => { if (active) setHealthy(true); }).catch(() => { if (active) setHealthy(false); });
    void apiRequest('/me', loginResponseSchema).then(v => { if (active) setUser(v.user); })
      .catch(e => { if (active && !(e instanceof ApiError && e.status === 401)) setError('No pudimos recuperar tu sesión.'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!user) { setRooms([]); return; }
    let active = true;
    void apiRequest('/rooms', roomListSchema).then(v => { if (active) setRooms(v.items); })
      .catch(e => { if (active) { setError(e instanceof Error ? e.message : 'No pudimos cargar las salas'); if (e instanceof ApiError && e.status === 401) setUser(null); } });
    return () => { active = false; };
  }, [user]);
  const login = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const input = loginSchema.safeParse({ email, password });
    if (!input.success) { setError('Escribe un correo válido y tu contraseña.'); return; }
    setPending(true);
    try { const result = await apiRequest('/auth/login', loginResponseSchema, { method: 'POST', body: JSON.stringify(input.data) }); setUser(result.user); setPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos iniciar sesión'); }
    finally { setPending(false); }
  };
  const logout = async () => {
    setPending(true); setError('');
    try { await apiRequest('/auth/logout', { parse: () => undefined }, { method: 'POST' }); setUser(null); }
    catch (e) { if (e instanceof ApiError && e.status === 401) setUser(null); else setError(e instanceof Error ? e.message : 'No pudimos cerrar sesión'); }
    finally { setPending(false); }
  };
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Lumni, inicio"><span className="brand-mark" aria-hidden="true">l</span>lumni<span className="brand-caption">espacios</span></a><span className="location">Bogotá, Colombia <span aria-hidden="true">↗</span></span></header>
    <main>
      <section className="intro"><span className="eyebrow">ESPACIO PARA TUS IDEAS</span><h1>Tu próximo encuentro<br/>empieza aquí<span>.</span></h1><p>Salas para concentrarte, compartir y crear.<br/>Encuentra un espacio a la medida de tu equipo.</p><div className="schedule"><span aria-hidden="true">◷</span> Lunes a sábado · 7:00 a. m. a 9:00 p. m.</div><div className="intro-decoration" aria-hidden="true"><div/><div/><div/></div></section>
      <section className="content-panel" aria-labelledby="panel-title">
        {!ready ? <p role="status">Recuperando tu sesión…</p> : user ? <>
          <div className="panel-heading"><div><span className="eyebrow">BIENVENIDO DE NUEVO</span><h2 id="panel-title">Hola, {user.fullName}</h2></div><span className="role-badge">{user.role === 'admin' ? 'Administrador' : 'Cliente'}</span></div>
          <p className="panel-description">Conoce nuestros espacios</p>
          <div className="room-list">{rooms.map(room => <article className="room" key={room.id}><div className="room-icon" aria-hidden="true">{room.capacity}</div><div><h3>{room.name}</h3><p>Hasta {room.capacity} personas</p></div><div className="room-price">{cop.format(room.hourlyRateCop)}<small>por hora</small></div></article>)}</div>
          <button className="secondary" type="button" disabled={pending} onClick={() => { void logout(); }}>{pending ? 'Cerrando…' : 'Cerrar sesión'}</button>
        </> : <>
          <span className="eyebrow">TU ESPACIO DE TRABAJO</span><h2 id="panel-title">Qué bueno verte</h2><p className="panel-description">Inicia sesión para conocer nuestras salas.</p>
          <form onSubmit={event => { void login(event); }} aria-busy={pending}>
            <label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="username" placeholder="tu@correo.com" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={pending}/>
            <label htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={pending}/>
            <button type="submit" disabled={pending}>{pending ? 'Ingresando…' : <>Entrar a mi espacio <span aria-hidden="true">→</span></>}</button>
          </form><p className="form-note">Tu sesión se guarda de forma segura en este navegador.</p>
        </>}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    </main>
    <footer><span>Una sala. Muchas posibilidades.</span><span className="status" role="status"><i className={healthy === true ? 'online' : healthy === false ? 'offline' : ''}/>{healthy === null ? 'Conectando' : healthy ? 'Servicio disponible' : 'Servicio no disponible'}</span></footer>
  </div>;
}
