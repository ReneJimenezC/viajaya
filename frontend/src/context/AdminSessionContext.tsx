// Sesión del administrador en el navegador (N-7, SAD 3.4: "context/ = estado en cliente").
// - El access token (15 min) vive SOLO en memoria (una variable): no va a localStorage, así un
//   script malicioso inyectado en la página no lo encuentra guardado (protección contra XSS).
// - Al abrir o recargar el panel (F5), se pide un token nuevo con la cookie del refresh: si la
//   sesión sigue viva, no se vuelve a pedir la contraseña.
// - La renovación es "perezosa": solo cuando hace falta (token por vencer o un 401). Así se respeta
//   la inactividad de 20 min del backend: si el admin no hace nada en 20 min, la sesión muere.
// Equivale a un SecurityContext de Spring que guarda quién está autenticado.

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, errorMessage, request, type RequestOptions } from '../services/api-client';
import * as authApi from '../services/auth-api';
import type { AuthorizedRequest } from '../services/admin-api';
import type { LoginResult } from '../services/types';

// checking = revisando si hay una sesión (al abrir el panel); authenticated = hay token;
// anonymous = hay que iniciar sesión; unreachable = no se pudo preguntar (sin conexión, API
// apagada o demasiados intentos): no se sabe si hay sesión, así que no se manda al login
export type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'unreachable';

export interface AdminSession {
  status: SessionStatus;
  // true si la sesión se perdió estando adentro (para avisar "Tu sesión expiró")
  expired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Petición con el token del admin (ver send más abajo)
  send: AuthorizedRequest;
  // Motivo del estado "unreachable" y cómo volver a intentarlo
  startupError: string;
  retry: () => void;
}

export const AdminSessionContext = createContext<AdminSession | null>(null);

// Se renueva el token si le quedan menos de 30 s, para que no venza a mitad de una petición
const RENEW_MARGIN_MS = 30_000;
export const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Inicia sesión de nuevo.';

interface StoredToken {
  value: string;
  expiresAt: number;
}

// Una sola renovación a la vez, compartida (como un "synchronized"): si dos pantallas piden
// renovar al mismo tiempo, las dos esperan la MISMA petición. Sin esto, el backend vería dos
// usos del mismo refresh token (rotación) y en el peor caso anularía la sesión.
let renewalInFlight: Promise<LoginResult> | null = null;

function renewOnce(): Promise<LoginResult> {
  renewalInFlight ??= authApi.refreshSession().finally(() => {
    renewalInFlight = null;
  });
  return renewalInFlight;
}

function toStoredToken(result: LoginResult): StoredToken {
  return { value: result.accessToken, expiresAt: Date.now() + result.expiresIn * 1000 };
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [expired, setExpired] = useState(false);
  const [startupError, setStartupError] = useState('');
  // Cada cambio de este número repite la revisión inicial de la sesión (botón "Intentar de nuevo")
  const [checkAttempt, setCheckAttempt] = useState(0);
  // useRef = una variable que sobrevive a los redibujos sin provocar uno nuevo
  const tokenRef = useRef<StoredToken | null>(null);

  // Pide un token nuevo con la cookie. Si la sesión ya no sirve, pasa a "anonymous".
  const renew = useCallback(async (): Promise<string> => {
    try {
      const stored = toStoredToken(await renewOnce());
      tokenRef.current = stored;
      setStatus('authenticated');
      return stored.value;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        tokenRef.current = null;
        setStatus('anonymous');
        setExpired(true);
        throw new ApiError(401, 'UNAUTHORIZED', SESSION_EXPIRED_MESSAGE);
      }
      throw error;
    }
  }, []);

  // Al abrir el panel: ¿sigue viva la sesión? (recargar con F5 no pide la contraseña)
  useEffect(() => {
    let active = true;
    renewOnce()
      .then((result) => {
        if (!active) return;
        tokenRef.current = toStoredToken(result);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Solo un 401 significa "no hay sesión"; cualquier otro fallo es "no se pudo saber"
        if (error instanceof ApiError && error.status === 401) {
          setStatus('anonymous');
        } else {
          setStartupError(errorMessage(error));
          setStatus('unreachable');
        }
      });
    return () => {
      active = false;
    };
  }, [checkAttempt]);

  const retry = useCallback(() => {
    setStartupError('');
    setStatus('checking');
    setCheckAttempt((attempt) => attempt + 1);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    tokenRef.current = toStoredToken(result);
    setExpired(false);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Aunque la API no responda, en este navegador la sesión se cierra igual
    }
    tokenRef.current = null;
    setExpired(false);
    setStatus('anonymous');
  }, []);

  // Petición del admin: 1) usa el token si le queda tiempo, si no lo renueva; 2) si la API
  // responde 401 (token vencido o rechazado), renueva UNA vez y repite la petición.
  const send = useCallback(
    async <T,>(path: string, options: Omit<RequestOptions, 'token'> = {}): Promise<T> => {
      const current = tokenRef.current;
      const token =
        current && current.expiresAt - Date.now() > RENEW_MARGIN_MS ? current.value : await renew();
      try {
        return await request<T>(path, { ...options, token });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return request<T>(path, { ...options, token: await renew() });
        }
        throw error;
      }
    },
    [renew],
  ) as AuthorizedRequest;

  // useMemo: el mismo objeto mientras nada cambie (evita redibujar a todos sin motivo)
  const value = useMemo<AdminSession>(
    () => ({ status, expired, login, logout, send, startupError, retry }),
    [status, expired, login, logout, send, startupError, retry],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}