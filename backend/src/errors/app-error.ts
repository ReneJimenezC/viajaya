// Error "controlado" de la API: lo lanzan los servicios cuando algo sale mal por una razón
// conocida (no existe, no tiene permiso, sin cupo...). El manejador central lo convierte en
// la respuesta JSON del formato B. Equivale a ResponseStatusException de Spring.

// Un problema puntual de un campo del body, para la lista "details" de la respuesta
export interface ErrorDetail {
  field: string;
  message: string;
}

export class AppError extends Error {
  // Código HTTP de la respuesta (404, 409, 422...)
  readonly status: number;
  // Código fijo en inglés que el frontend puede comparar ("NOT_FOUND", "CONFLICT"...)
  readonly code: string;
  // Lista opcional de problemas por campo
  readonly details?: ErrorDetail[];

  constructor(status: number, code: string, message: string, details?: ErrorDetail[]) {
    // super() guarda el mensaje en la clase base Error (como en Java)
    super(message);
    // Nombre visible en los logs en vez de "Error"
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    // Solo se asigna si viene: así la respuesta no lleva "details": undefined
    if (details) {
      this.details = details;
    }
  }
}