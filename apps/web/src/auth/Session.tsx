import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { loginResponseSchema, type User } from '@lumni/shared';
import { apiRequest, ApiError } from '../api.js';
import { Modal } from '../components/Modal.js';
import { LoginForm } from './LoginForm.js';
import { ErrorNotice, Loading } from '../components/Feedback.js';
const Context = createContext<{
  user: User | null | undefined;
  accept: (user: User) => void;
  clear: () => void;
} | null>(null);
export const homeFor = (user: User) => (user.role === 'admin' ? '/admin/reservas' : '/salas');
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>();
  const [error, setError] = useState<unknown>(null);
  const [expired, setExpired] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    void apiRequest('/me', loginResponseSchema)
      .then((value) => {
        if (active) setUser(value.user);
      })
      .catch((error) => {
        if (active) {
          setUser(null);
          if (!(error instanceof ApiError && error.status === 401)) setError(error);
        }
      });
    const expire = () => setExpired(true);
    window.addEventListener('session-expired', expire);
    return () => {
      active = false;
      window.removeEventListener('session-expired', expire);
    };
  }, []);
  const accept = (next: User) => {
    if (user && user.id !== next.id) {
      queryClient.clear();
      navigate(homeFor(next), { replace: true });
    } else
      void queryClient.invalidateQueries({ predicate: (query) => query.state.data === undefined });
    setExpired(false);
    setUser(next);
    setError(null);
  };
  const clear = () => {
    setUser(null);
    setExpired(false);
    queryClient.clear();
  };
  return (
    <Context.Provider value={{ user, accept, clear }}>
      {!!error && (
        <div className="session-error">
          <ErrorNotice error={error} />
        </div>
      )}
      {children}
      {expired && user && (
        <Modal label="Sesión terminada" className="auth-modal">
          <LoginForm expired onSuccess={accept} />
        </Modal>
      )}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('Falta sesión');
  return value;
}
export function RequireSession() {
  const { user } = useSession();
  const location = useLocation();
  if (user === undefined) return <Loading label="Recuperando tu sesión…" />;
  if (!user) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />;
  return <Outlet key={user.id} />;
}
export function RequireRole({ role }: { role: User['role'] }) {
  const { user } = useSession();
  if (user?.role !== role)
    return (
      <section className="card empty">
        <h1>Acceso restringido</h1>
        <p>Tu cuenta no tiene acceso a esta sección.</p>
      </section>
    );
  return <Outlet />;
}
export function LoginPage() {
  useEffect(() => {
    document.title = 'Lumni · Ingresar';
  }, []);
  const { user, accept } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  if (user === undefined) return <Loading label="Recuperando tu sesión…" />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <div className="login-page">
      <div className="login-intro">
        <span className="eyebrow">ESPACIO PARA TUS IDEAS</span>
        <h1>
          Tu próximo encuentro
          <br />
          empieza aquí<span>.</span>
        </h1>
        <p>
          Salas para concentrarte, compartir y crear.
          <br />
          Encuentra un espacio a la medida de tu equipo.
        </p>
        <div className="login-art" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="location">Medellín, Colombia · Lunes a sábado</span>
      </div>
      <LoginForm
        onSuccess={(next) => {
          accept(next);
          const from: unknown = location.state?.from;
          navigate(
            typeof from === 'string' && from.startsWith('/') && from !== '/salir'
              ? from
              : homeFor(next),
            { replace: true },
          );
        }}
      />
    </div>
  );
}
export function LogoutPage() {
  const { clear } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const navigate = useNavigate();
  const logout = async () => {
    setPending(true);
    setError(null);
    try {
      await apiRequest('/auth/logout', { parse: () => undefined }, { method: 'POST' });
      clear();
      navigate('/ingresar', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clear();
        navigate('/ingresar', { replace: true });
      } else setError(error);
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="card narrow">
      <h1>Cerrar sesión</h1>
      <p className="muted">Tus reservas y los pasos guardados estarán aquí cuando regreses.</p>
      <ErrorNotice error={error} />
      <button
        className="button"
        disabled={pending}
        onClick={() => {
          void logout();
        }}
      >
        {pending ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
    </section>
  );
}
