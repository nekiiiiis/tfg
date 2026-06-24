/**
 * Excepciones del dominio.
 *
 * Heredan de `DomainError` para que el filtro de presentación pueda traducirlas
 * a códigos HTTP en un solo punto (cap. 3 §Errores en disenoClases.md).
 */

export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EntidadNoEncontrada extends DomainError {
  readonly status = 404;
  readonly code = 'ENTIDAD_NO_ENCONTRADA';
}
export class EntidadDuplicada extends DomainError {
  readonly status = 409;
  readonly code = 'ENTIDAD_DUPLICADA';
}
export class DireccionInvalida extends DomainError {
  readonly status = 422;
  readonly code = 'DIRECCION_INVALIDA';
}
export class DireccionYaAsignada extends DomainError {
  readonly status = 409;
  readonly code = 'DIRECCION_YA_ASIGNADA';
}
export class AlertaNoEncontrada extends DomainError {
  readonly status = 404;
  readonly code = 'ALERTA_NO_ENCONTRADA';
}
export class WebhookInvalido extends DomainError {
  readonly status = 422;
  readonly code = 'WEBHOOK_INVALIDO';
}
export class TokenDesconocido extends DomainError {
  readonly status = 422;
  readonly code = 'TOKEN_DESCONOCIDO';
}
export class TransicionNoPermitida extends DomainError {
  readonly status = 409;
  readonly code = 'TRANSICION_NO_PERMITIDA';
}
