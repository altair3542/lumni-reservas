import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { loginSchema, loginResponseSchema, type User } from '@lumni/shared';
import { apiRequest } from '../api.js';
import { ErrorNotice } from '../components/Feedback.js';
export function LoginForm({
  onSuccess,
  expired = false,
}: {
  onSuccess: (user: User) => void;
  expired?: boolean;
}) {
  const form = useForm<{ email: string; password: string }>({
    defaultValues: { email: '', password: '' },
  });
  const [error, setError] = useState<unknown>(null);
  const submit = form.handleSubmit(async (values) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setError(new Error('Escribe un correo válido y tu contraseña.'));
      return;
    }
    setError(null);
    try {
      const result = await apiRequest('/auth/login', loginResponseSchema, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      form.reset();
      onSuccess(result.user);
    } catch (error) {
      setError(error);
    }
  });
  return (
    <section className="card login-card">
      <span className="eyebrow">TU ESPACIO DE TRABAJO</span>
      <h2>{expired ? 'Tu sesión terminó' : 'Qué bueno verte'}</h2>
      <p className="muted">
        {expired
          ? 'Vuelve a ingresar para continuar donde estabas.'
          : 'Ingresa y encuentra un lugar para tu próximo encuentro.'}
      </p>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-busy={form.formState.isSubmitting}
      >
        <fieldset disabled={form.formState.isSubmitting}>
          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="username"
              maxLength={254}
              required
              placeholder="tu@correo.com"
              {...form.register('email')}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
              placeholder="Tu contraseña"
              {...form.register('password')}
            />
          </label>
          <button className="button" type="submit">
            {form.formState.isSubmitting ? 'Ingresando…' : 'Entrar a mi espacio →'}
          </button>
        </fieldset>
      </form>
      <ErrorNotice error={error} />
      <p className="form-note">Tu sesión se guarda de forma segura en este navegador.</p>
    </section>
  );
}
