// RN-04 (pasarela simulada): último dígito de la tarjeta par = aprobado, impar = rechazado.
// Va detrás de una interfaz: el día que haya una pasarela real, se cambia la clase
// sin tocar el servicio de reservas.

// Lo que recibe la pasarela. El número completo de la tarjeta NUNCA se guarda ni se anota.
export interface PaymentRequest {
  cardNumber: string;
  amount: string;
}

// Resultado del cobro: solo el último dígito queda para la tabla "pagos"
export interface PaymentResult {
  approved: boolean;
  lastDigit: number;
}

// Contrato de cualquier pasarela (simulada o real)
export interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentResult>;
}

// Número de tarjeta: solo dígitos, de 13 a 19 (largos usados por las tarjetas)
const CARD_NUMBER_PATTERN = /^\d{13,19}$/;

export class SimulatedPaymentGateway implements PaymentGateway {
  // Aprueba si el último dígito es par. Ejemplo: "4111111111111112" → aprobado, dígito 2
  async charge(request: PaymentRequest): Promise<PaymentResult> {
    if (!CARD_NUMBER_PATTERN.test(request.cardNumber)) {
      throw new RangeError('Número de tarjeta inválido');
    }
    const lastDigit = Number(request.cardNumber.at(-1));
    return { approved: lastDigit % 2 === 0, lastDigit };
  }
}