// Tipos de lo que envía y devuelve la API. Copian las respuestas reales del backend y del
// contrato docs/api/openapi.yaml. Equivalen a los DTO de respuesta en Java.

// ----- Estados (los mismos textos que guarda la base) -----
export type ReservationStatus = 'Pendiente' | 'Aprobada' | 'Cancelada';
export type PaymentStatus = 'Pendiente' | 'Aprobado' | 'Rechazado';
export const PAYMENT_STATES: readonly PaymentStatus[] = ['Pendiente', 'Aprobado', 'Rechazado'];

// ----- Errores (formato B del backend) -----
export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: ApiErrorDetail[] };
}

// ----- Destinos -----
// Lo que ve el turista (GET /destinos): sin capacidad total ni estado
export interface PublicDestination {
  id: number;
  name: string;
  description: string | null;
  place: string;
  basePrice: string;
  // Solo si la búsqueda trae fecha y personas (CU-01 5a)
  availableSeats?: number;
  available?: boolean;
}

// Lo que ve el admin (/admin/destinos): el destino completo
export interface AdminDestination {
  id: number;
  name: string;
  description: string | null;
  place: string;
  basePrice: string;
  dailyCapacity: number;
  active: boolean;
}

// Body de POST /admin/destinos. El precio va como NÚMERO (el backend lo exige así)
export interface DestinationInput {
  name: string;
  place: string;
  description: string | null;
  basePrice: number;
  dailyCapacity: number;
}

// ----- Cotización y reservas del turista -----
export interface Quote {
  basePrice: string;
  people: number;
  subtotal: string;
  iva: string;
  total: string;
}

// Respuesta de POST /cotizaciones
export interface QuoteResult {
  destination: { id: number; name: string; place: string };
  travelDate: string;
  quote: Quote;
}

// Respuesta común de crear, consultar, cambiar fecha y cancelar (decisión 11 del backend)
export interface Reservation {
  code: string;
  status: ReservationStatus;
  destination: { id: number; name: string; place: string };
  travelDate: string;
  customerName: string;
  customerEmail: string;
  quote: Quote;
  payment: { status: PaymentStatus; cardLastDigit: number };
  // Llega como texto ISO 8601 (JSON no tiene fechas)
  createdAt: string;
}

// Body de POST /reservas
export interface CreateReservationInput {
  destinationId: number;
  travelDate: string;
  people: number;
  customerName: string;
  customerEmail: string;
  cardNumber: string;
}

// Datos de acceso del turista: siempre en el body, nunca en la URL (N-4)
export interface ReservationAccess {
  code: string;
  customerEmail: string;
}

// ----- Reservas del admin -----
// La del turista + id interno, id del pago y reagendas (V17, V29)
export interface AdminReservation extends Omit<Reservation, 'payment'> {
  id: number;
  payment: { id: number; status: PaymentStatus; cardLastDigit: number };
  reschedules: number;
}

// ----- Sesión del admin -----
export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}