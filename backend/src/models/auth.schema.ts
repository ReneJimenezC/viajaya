// Plantillas (zod) de lo que reciben las rutas de autenticación.
// Equivale a un DTO con Bean Validation (@Email, @Size) en Java.

import { z } from 'zod';

// Largo máximo de un correo según el estándar de direcciones de correo
const EMAIL_MAX_LENGTH = 254;
// Tope de la contraseña: evita que una "contraseña" gigante haga trabajar de más a argon2.
// En el login NO se exige mínimo: solo se compara (decisión 3 del 03/11).
const PASSWORD_MAX_LENGTH = 128;

// Body de POST /auth/login. Ejemplo válido:
// { "email": "  Admin@ViajaYa.test ", "password": "una frase larga y segura" }
// → el correo queda "admin@viajaya.test"; la contraseña, tal cual.
export const loginSchema = z.object(
  {
    email: z
      .string({ error: 'El correo es obligatorio' })
      // Quita espacios a los lados y pasa a minúsculas (así se guardó en la base)
      .trim()
      .toLowerCase()
      .max(EMAIL_MAX_LENGTH, { error: `El correo no puede tener más de ${EMAIL_MAX_LENGTH} caracteres` })
      // pipe: después de limpiarlo, revisa que tenga forma de correo
      .pipe(z.email({ error: 'El correo no tiene un formato válido' })),
    password: z
      .string({ error: 'La contraseña es obligatoria' })
      .min(1, { error: 'La contraseña es obligatoria' })
      .max(PASSWORD_MAX_LENGTH, {
        error: `La contraseña no puede tener más de ${PASSWORD_MAX_LENGTH} caracteres`,
      }),
  },
  { error: 'El cuerpo de la petición debe ser un objeto JSON' },
);

// Tipo TypeScript que sale de la plantilla: { email: string; password: string }
export type LoginInput = z.infer<typeof loginSchema>;