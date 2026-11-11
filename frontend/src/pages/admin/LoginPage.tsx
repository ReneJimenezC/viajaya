// Inicio de sesión del administrador (SAD 3.1, CU-07 a CU-15 precondición "ha iniciado sesión").
// Se llega con el botón "Administración" del menú del turista (decisión del 10/11).
// El límite de 5 intentos fallidos cada 15 min lo pone la API (SAD 6); aquí se muestra su mensaje.

import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Loading } from '../../components/Loading';
import { Logo } from '../../components/Logo';
import { SessionUnreachable } from '../../components/layout/SessionUnreachable';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { useAdminSession } from '../../hooks/useAdminSession';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ApiError, errorMessage } from '../../services/api-client';
import { loginFormSchema, toFieldErrors, type FieldErrors } from '../../utils/validation';

// Solo se vuelve a páginas del panel (nunca a una dirección externa que venga en el estado)
function safeDestination(state: unknown): string {
  const from = typeof state === 'object' && state !== null ? (state as { from?: unknown }).from : undefined;
  return typeof from === 'string' && from.startsWith('/admin/') && from !== '/admin/ingresar' ? from : '/admin/reservas';
}

export function LoginPage() {
  useDocumentTitle('Ingreso de administración');
  const { status, expired, login } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = safeDestination(location.state);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState('');
  const [sending, setSending] = useState(false);

  if (status === 'checking') {
    return (
      <div className="mx-auto max-w-md px-4">
        <Loading text="Revisando tu sesión…" />
      </div>
    );
  }
  if (status === 'unreachable') {
    return <SessionUnreachable />;
  }
  // Ya hay sesión: no tiene sentido mostrar el formulario
  if (status === 'authenticated' && !sending) {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setProblem('');
    const result = loginFormSchema.safeParse({ email, password });
    if (!result.success) {
      setFieldErrors(toFieldErrors(result.error));
      return;
    }
    setFieldErrors({});
    setSending(true);
    try {
      await login(result.data.email, result.data.password);
      navigate(destination, { replace: true });
    } catch (error) {
      setSending(false);
      // 401 = correo o contraseña incorrectos; 429 = demasiados intentos (mensaje de la API);
      // 400 = un campo no cumple la regla del backend: se muestra junto al campo
      if (error instanceof ApiError && error.status === 400) {
        setFieldErrors({ email: error.fieldError('email'), password: error.fieldError('password') });
      }
      setProblem(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) setPassword('');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <main className="w-full max-w-md space-y-6">
        <div className="text-bosque">
          <Logo />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Ingreso de administración</h1>
          <p className="mt-1 text-basalto-suave">Solo para el personal de ViajaYa.</p>
        </div>
        {expired && !problem && <Alert tone="info">Tu sesión expiró. Inicia sesión de nuevo.</Alert>}
        {problem && <Alert tone="error">{problem}</Alert>}
        <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-xl border border-musgo bg-papel p-5 sm:p-6">
          <TextField
            label="Correo"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            required
          />
          <TextField
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            required
          />
          <Button type="submit" loading={sending} loadingText="Ingresando…" className="w-full">
            Ingresar
          </Button>
        </form>
        <Link to="/" className="inline-block font-semibold text-bosque underline">
          Volver al sitio de excursiones
        </Link>
      </main>
    </div>
  );
}