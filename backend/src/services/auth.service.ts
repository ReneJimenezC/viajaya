// AuthService (SAD 2): inicio de sesión del administrador y emisión de JWT.
// Equivale a un @Service de Spring con la lógica de autenticación.

import { argon2id, hash, verify } from 'argon2';
import { SignJWT } from 'jose';
import { AppError } from '../errors/app-error';
import type { AdminRepository } from '../repositories/admin.repository';
import type { LoginInput } from '../models/auth.schema';

// Duración del access token: 15 minutos (decidido 03/11, N-7)
export const ACCESS_TOKEN_TTL_SECONDS = 900;
// Quién emite el token y para quién es (decisión 2): al verificar se exigen ambos
export const JWT_ISSUER = 'viajaya-api';
export const JWT_AUDIENCE = 'viajaya-admin';
// Único algoritmo permitido (HMAC con SHA-256)
export const JWT_ALGORITHM = 'HS256';

// Lo que devuelve un login correcto (decisión 1)
export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

// El admin ya autenticado: lo necesario para firmar el token
export interface AuthenticatedAdmin {
  id: number;
  role: string;
}
// Hash falso para cuando el correo no existe: se verifica igual contra él, así el login
// tarda lo mismo exista o no el correo (un atacante no puede adivinar correos midiendo
// el tiempo). Se calcula una sola vez, la primera vez que hace falta.
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash('viajaya-dummy-password', { type: argon2id });
  return dummyHashPromise;
}

export class AuthService {
  // Clave de firma en bytes (jose la pide como Uint8Array)
  private readonly secretKey: Uint8Array;

  constructor(
    private readonly adminRepository: AdminRepository,
    jwtSecret: string,
  ) {
    // TextEncoder convierte el texto del secreto a bytes UTF-8
    this.secretKey = new TextEncoder().encode(jwtSecret);
    // Calcula el hash falso desde el arranque: así el PRIMER login con un correo
    // inexistente tampoco tarda más que los demás. "void" = no se espera a propósito.
    void getDummyHash();
  }

   // Recibe correo y contraseña ya validados. Devuelve el admin (id y rol) o lanza 401.
  async authenticate(input: LoginInput): Promise<AuthenticatedAdmin> {
    const admin = await this.adminRepository.findForLogin(input.email);

    // Siempre se ejecuta argon2 (con el hash real o el falso): mismo tiempo en ambos casos
    const storedHash = admin ? admin.passwordHash : await getDummyHash();
    const passwordOk = await verify(storedHash, input.password);

    if (!admin || !passwordOk) {
      // Mismo mensaje para "no existe" y "clave incorrecta": no revela si el correo existe
      throw new AppError(401, 'UNAUTHORIZED', 'Correo o contraseña incorrectos');
    }

    return { id: admin.id, role: admin.role };
  }

  
    // Crea y firma el access token (decisión 2) y arma la respuesta (decisión 1).
  // La usan el login y la renovación. Ejemplo de contenido del token:
  // { role: 'admin', sub: '3', iss: 'viajaya-api', aud: 'viajaya-admin', iat: ..., exp: iat + 900 }
  async issueAccessToken(admin: AuthenticatedAdmin): Promise<LoginResult> {
    // Segundos desde 1970 (Date.now() da milisegundos)
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({ role: admin.role })
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setSubject(String(admin.id))
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.secretKey);
    return { accessToken, tokenType: 'Bearer', expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}