/**
 * Eventos del dominio publicados en el bus interno.
 *
 * Cada evento es inmutable y lleva su `ocurridoEn`. Los nombres se mantienen
 * en pasado, como exige el cap. 3 (diseño de la arquitectura).
 */

import type { Operacion, Precio, TokenSymbol } from './types.ts';

export interface DomainEvent {
  readonly name: string;
  readonly ocurridoEn: number;
}

export interface OperacionRecibida extends DomainEvent {
  readonly name: 'OperacionRecibida';
  readonly operacion: Operacion;
}

export interface PrecioActualizado extends DomainEvent {
  readonly name: 'PrecioActualizado';
  readonly precio: Precio;
}

export interface AlertaDisparada extends DomainEvent {
  readonly name: 'AlertaDisparada';
  readonly alertaId: string;
  readonly token: TokenSymbol;
  readonly precioDisparador: number;
}

export interface NotificacionConfirmada extends DomainEvent {
  readonly name: 'NotificacionConfirmada';
  readonly notificacionId: string;
  readonly alertaId: string;
}

export interface NotificacionFallida extends DomainEvent {
  readonly name: 'NotificacionFallida';
  readonly notificacionId: string;
  readonly alertaId: string;
  readonly motivo: string;
}

export interface LeaderboardActualizado extends DomainEvent {
  readonly name: 'LeaderboardActualizado';
  readonly terna: import('./types.ts').Terna;
  /** Filas top-N tras aplicar la operación. */
  readonly topN: ReadonlyArray<{
    direccion: string;
    volumenCompra: number;
    volumenVenta: number;
  }>;
}

export type DomainEventMap = {
  OperacionRecibida: OperacionRecibida;
  PrecioActualizado: PrecioActualizado;
  AlertaDisparada: AlertaDisparada;
  NotificacionConfirmada: NotificacionConfirmada;
  NotificacionFallida: NotificacionFallida;
  LeaderboardActualizado: LeaderboardActualizado;
};

export type DomainEventName = keyof DomainEventMap;
