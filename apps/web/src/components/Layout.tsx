import { lazy, Suspense, useEffect } from 'react';
import { Loading } from './Feedback.js';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { healthSchema } from '@lumni/shared';
import { apiRequest } from '../api.js';
import { useSession } from '../auth/Session.js';
const AssistantDock = lazy(() =>
  import('../assistant/AssistantDock.js').then((module) => ({ default: module.AssistantDock })),
);
export function Layout() {
  const { user } = useSession();
  const location = useLocation();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiRequest('/health', healthSchema),
    staleTime: 30000,
  });
  const admin = user?.role === 'admin';
  const pageName = location.pathname.startsWith('/admin/correos')
    ? 'Correos de confirmación'
    : location.pathname.startsWith('/admin')
      ? 'Administración de reservas'
      : location.pathname.startsWith('/reservas/')
        ? 'Detalle de tu reserva'
        : location.pathname === '/reservas'
          ? 'Mis reservas'
          : location.pathname.startsWith('/asistente')
            ? 'Asistente de reservas'
            : location.pathname === '/salir'
              ? 'Cerrar sesión'
              : 'Reservar espacio';
  useEffect(() => {
    document.title = `Lumni · ${pageName}`;
  }, [pageName]);
  const links = admin
    ? [
        { to: '/admin/reservas', label: 'Reservas', icon: '▤' },
        { to: '/admin/correos', label: 'Correos', icon: '✉' },
      ]
    : [
        { to: '/salas', label: 'Reservar espacio', icon: '▦' },
        { to: '/reservas', label: 'Mis reservas', icon: '▤' },
      ];
  return (
    <div className="workspace">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="Lumni, inicio">
          <span className="brand-mark">l</span>lumni<span className="brand-caption">espacios</span>
        </NavLink>
        <span className="nav-caption">{admin ? 'ADMINISTRACIÓN' : 'MI ESPACIO'}</span>
        <nav aria-label="Navegación principal">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span aria-hidden="true">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="small-orbit" aria-hidden="true" />
          <strong>
            Una sala.
            <br />
            Muchas posibilidades.
          </strong>
          <p>
            Medellín, Colombia
            <br />
            Lun–sáb · 7 a. m. a 9 p. m.
          </p>
        </div>
        <div className="user-menu">
          <div className="avatar">{user?.fullName.slice(0, 1)}</div>
          <div>
            <strong>{user?.fullName}</strong>
            <small>{admin ? 'Administrador' : 'Cliente'}</small>
          </div>
          <NavLink className="logout-link" to="/salir" aria-label="Salir de mi cuenta">
            ↗
          </NavLink>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <span>{admin ? 'Administración de espacios' : 'Tu espacio, a tu ritmo'}</span>
          <span className="service-status">
            <i className={health.isSuccess ? 'online' : 'offline'} />
            {health.isPending
              ? 'Conectando'
              : health.isSuccess
                ? 'Servicio disponible'
                : 'Servicio no disponible'}
          </span>
        </header>
        <main className="page-content" key={user?.id}>
          <Suspense fallback={<Loading label="Preparando tu espacio…" />}>
            <Outlet />
          </Suspense>
        </main>
        <footer>
          <span>Hecho para encontrarnos.</span>
          <span>Todos los horarios corresponden a Colombia.</span>
        </footer>
      </div>
      {user?.role === 'client' && location.pathname !== '/salir' && (
        <Suspense fallback={null}>
          <AssistantDock key={user.id} ownerId={user.id} />
        </Suspense>
      )}
      <span className="sr-only" aria-live="polite">
        {pageName}
      </span>
    </div>
  );
}
