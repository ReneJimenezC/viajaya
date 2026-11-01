// Único lugar que lee process.env. El resto del código importa "env" desde aquí.
// Si falta una variable o es inválida, la API no arranca (fail-fast).

// Valores permitidos para NODE_ENV; "as const" los vuelve un tipo literal
const NODE_ENVS = ['development', 'production', 'test'] as const;
// Tipo derivado del arreglo: 'development' | 'production' | 'test'
type NodeEnv = (typeof NODE_ENVS)[number];

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

// Objeto de configuración congelado: nadie puede modificarlo en tiempo de ejecución.
// DATABASE_URL se agregará aquí en el módulo de conexión a la base de datos.
export const env = Object.freeze({
  nodeEnv: readNodeEnv(),
  port: readPort(),
});