import { lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHashRouter, Navigate, RouterProvider, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import {
  SessionProvider,
  RequireSession,
  RequireRole,
  LoginPage,
  LogoutPage,
  useSession,
  homeFor,
} from './auth/Session.js';
const ChatPage = lazy(() =>
  import('./assistant/ChatPage.js').then((module) => ({ default: module.ChatPage })),
);
const QuotePage = lazy(() =>
  import('./features/quote/QuotePage.js').then((module) => ({ default: module.QuotePage })),
);
const BookingListPage = lazy(() =>
  import('./features/bookings/BookingListPage.js').then((module) => ({
    default: module.BookingListPage,
  })),
);
const BookingPage = lazy(() =>
  import('./features/bookings/BookingPage.js').then((module) => ({ default: module.BookingPage })),
);
const AdminBookingsPage = lazy(() =>
  import('./features/admin/AdminBookingsPage.js').then((module) => ({
    default: module.AdminBookingsPage,
  })),
);
const AdminBookingPage = lazy(() =>
  import('./features/admin/AdminBookingPage.js').then((module) => ({
    default: module.AdminBookingPage,
  })),
);
const EmailsPage = lazy(() =>
  import('./features/admin/EmailsPage.js').then((module) => ({ default: module.EmailsPage })),
);
const EmailPage = lazy(() =>
  import('./features/admin/EmailsPage.js').then((module) => ({ default: module.EmailPage })),
);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15000 },
    mutations: { retry: false },
  },
});
function Root() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}
function Home() {
  const { user } = useSession();
  return user ? <Navigate to={homeFor(user)} replace /> : null;
}
function AppErrorPage() {
  return (
    <section className="card narrow">
      <h1>No pudimos abrir esta página</h1>
      <p className="muted">
        Comprueba tu conexión y vuelve a cargar. Los pasos que guardaste se conservan.
      </p>
      <button className="button" onClick={() => window.location.reload()}>
        Recargar aplicación
      </button>
    </section>
  );
}
const router = createHashRouter([
  {
    element: <Root />,
    errorElement: <AppErrorPage />,
    children: [
      { path: '/ingresar', element: <LoginPage /> },
      {
        element: <RequireSession />,
        children: [
          {
            element: <Layout />,
            children: [
              { index: true, element: <Home /> },
              { path: '/salir', element: <LogoutPage /> },
              {
                element: <RequireRole role="client" />,
                children: [
                  { path: '/salas', element: <QuotePage /> },
                  { path: '/asistente', element: <ChatPage /> },
                  { path: '/asistente/:id', element: <ChatPage /> },
                  { path: '/reservas', element: <BookingListPage /> },
                  { path: '/reservas/:id', element: <BookingPage /> },
                ],
              },
              {
                element: <RequireRole role="admin" />,
                children: [
                  { path: '/admin/reservas', element: <AdminBookingsPage /> },
                  { path: '/admin/reservas/:id', element: <AdminBookingPage /> },
                  { path: '/admin/correos', element: <EmailsPage /> },
                  { path: '/admin/correos/:id', element: <EmailPage /> },
                ],
              },
              {
                path: '*',
                element: (
                  <section className="card empty">
                    <h1>No encontramos esta página</h1>
                    <a href="#/">Volver al inicio</a>
                  </section>
                ),
              },
            ],
          },
        ],
      },
    ],
  },
]);
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
