/**
 * Bus de eventos del dominio, en proceso.
 *
 * `EventEmitter` nativo de Node con una capa tipada encima para que productores
 * y consumidores comparten el contrato de cargas útiles definido en
 * `domain/events.ts`. Sustituye al `EventEmitter2` (`@nestjs/event-emitter`)
 * del cap. 3.
 */

import { EventEmitter } from 'node:events';
import type { DomainEventMap, DomainEventName } from './domain/events.ts';

class TypedBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Permitimos suscripciones generosas: gateway WS, evaluador, leaderboard…
    this.emitter.setMaxListeners(0);
  }

  emit<K extends DomainEventName>(name: K, event: DomainEventMap[K]): void {
    this.emitter.emit(name, event);
  }

  on<K extends DomainEventName>(
    name: K,
    handler: (event: DomainEventMap[K]) => void | Promise<void>,
  ): () => void {
    const wrapped = (event: DomainEventMap[K]) => {
      // No bloqueamos al productor por errores del consumidor.
      Promise.resolve()
        .then(() => handler(event))
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[bus] handler error for ${name}:`, err);
        });
    };
    this.emitter.on(name, wrapped as (e: unknown) => void);
    return () => this.emitter.off(name, wrapped as (e: unknown) => void);
  }
}

export const bus = new TypedBus();
export type DomainBus = typeof bus;
