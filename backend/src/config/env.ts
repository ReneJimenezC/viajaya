// Único lugar que lee process.env. El resto del código importa "env" desde aquí.
// Si falta una variable o es inválida, la API no arranca (fail-fast).

// Valores permitidos para NODE_ENV; "as const" los vuelve un tipo literal
const NODE_ENVS = ['development', 'production', 'test'] as const;
// Tipo derivado del arreglo: 'development' | 'production' | 'test'
type NodeEnv = (typeof NODE_ENVS)[number];
 // Protocolos aceptados en DATABASE_URL (Postgres acepta los dos nombres)
 const DATABASE_PROTOCOLS = ['postgres:', 'postgresql:'];

 // NUEVO (Paso 3): largo mínimo del secreto JWT. Con HS256 se recomienda al menos
// 32 bytes (256 bits); uno más corto se puede adivinar probando combinaciones.
const JWT_SECRET_MIN_LENGTH = 32;

// Lee una variable obligatoria o lanza un error con su nombre
function required(name: string): string {
  // Toma el valor y le quita espacios accidentales
  const value = process.env[name]?.trim();
  // Vacío o inexistente = error claro al arrancar
  if (!value) {
    throw new Error(`Variable de entorno faltante: ${name}`);
  }
  return value;
}

// Valida que NODE_ENV sea uno de los valores permitidos
function readNodeEnv(): NodeEnv {
  const value = required('NODE_ENV');
  // includes() revisa la lista; el cast es seguro porque ya se comprobó
  if (!(NODE_ENVS as readonly string[]).includes(value)) {
    throw new Error(`NODE_ENV inválido: "${value}". Use: ${NODE_ENVS.join(', ')}`);
  }
  return value as NodeEnv;
}

// Valida que PORT sea un entero entre 1 y 65535
function readPort(): number {
  const raw = required('PORT');
  // Number("abc") da NaN, que no pasa la validación de abajo
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT inválido: "${raw}"`);
  }
      return port;
  }

 // Valida que DATABASE_URL tenga forma de URL de Postgres.
// Los mensajes de error NUNCA muestran el valor: contiene la contraseña.
 function readDatabaseUrl(): string {
  const raw = required('DATABASE_URL');
   let url: URL;
   try {
    // new URL() separa la cadena en partes; si el formato es inválido, lanza un error
     url = new URL(raw);
   } catch {
     // Se descarta el error original porque su mensaje incluye la URL completa
     throw new Error('DATABASE_URL inválida: no tiene formato de URL');
   }
   // Debe empezar con postgres:// o postgresql://
   if (!DATABASE_PROTOCOLS.includes(url.protocol)) {
    throw new Error('DATABASE_URL inválida: debe empezar con postgresql://');
   }
   // Debe indicar el servidor (localhost, db, el host de Supabase...)
   if (!url.hostname) {
     throw new Error('DATABASE_URL inválida: falta el host');
  }
 // Debe indicar la base de datos: pathname es "/viajaya"; "/" solo no basta
  if (url.pathname.length <= 1) {
    throw new Error('DATABASE_URL inválida: falta el nombre de la base de datos');
     }
   // Se devuelve el texto original: TypeORM y pg reciben la URL tal cual
   return raw;
 }

 // NUEVO (Paso 3): valida el secreto con el que la API firma los access tokens (JWT).
// Como DATABASE_URL, los errores NUNCA muestran el valor.
function readJwtSecret(): string {
  const value = required('JWT_SECRET');
  // .length cuenta caracteres; el secreto generado tiene 64 (solo letras, números, - y _)
  if (value.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET demasiado corto: debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres`,
    );
  }
  return value;
}


// NUEVO (Paso 10): origen del frontend permitido por CORS (SAD 6, V52).
// Debe ser solo protocolo + dominio + puerto, sin ruta ni barra final, porque el navegador
// envía exactamente eso en la cabecera Origin. Ej.: "http://localhost:5173".
function readCorsOrigin(): string {
  const raw = required('CORS_ORIGIN');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`CORS_ORIGIN inválido: "${raw}" no tiene formato de URL`);
  }
  // url.origin arma "protocolo://dominio:puerto"; si no es igual al texto, sobra algo
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== raw) {
    throw new Error(
      `CORS_ORIGIN inválido: "${raw}". Use solo protocolo, dominio y puerto, sin barra final (ej. http://localhost:5173)`,
    );
  }
  // En producción el frontend se sirve por HTTPS (SAD 6): un http:// sería un error de configuración
  if (readNodeEnv() === 'production' && url.protocol !== 'https:') {
    throw new Error('CORS_ORIGIN inválido: en producción debe empezar con https://');
  }
  return raw;
}

// NUEVO (Paso 10): cuántos proxies hay delante de la API (V55). En tu PC 0; en Render 1.
// Express usa este número para tomar la IP real del cliente de X-Forwarded-For; sin él,
// en Render todos parecerían la misma IP y los límites de intentos bloquearían a todos.
// Es opcional: si no está, vale 0 (no se confía en ningún proxy, la opción segura).
const TRUST_PROXY_MAX_HOPS = 5;

function readTrustProxyHops(): number {
  const raw = process.env.TRUST_PROXY_HOPS?.trim();
  if (!raw) {
    return 0;
  }
  const hops = Number(raw);
  if (!/^\d+$/.test(raw) || hops > TRUST_PROXY_MAX_HOPS) {
    throw new Error(`TRUST_PROXY_HOPS inválido: "${raw}". Use un entero de 0 a ${TRUST_PROXY_MAX_HOPS}`);
  }
  return hops;
}

// Objeto de configuración congelado: nadie puede modificarlo en tiempo de ejecución.
// DATABASE_URL se agregará aquí en el módulo de conexión a la base de datos.
export const env = Object.freeze({
  nodeEnv: readNodeEnv(),
  port: readPort(),
  databaseUrl: readDatabaseUrl(),
    // NUEVO (Paso 3)
  jwtSecret: readJwtSecret(),
    // NUEVO (Paso 10)
  corsOrigin: readCorsOrigin(),
  trustProxyHops: readTrustProxyHops(),
});