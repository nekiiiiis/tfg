/**
 * Mapper de excepciones del dominio a respuestas HTTP. Adaptador primario
 * común para todos los controllers.
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../domain/errors.ts';
import { logger } from './logger.ts';

export function attachErrorHandler(fastify: import('fastify').FastifyInstance): void {
  fastify.setErrorHandler(
    (err: FastifyError | Error, _req: FastifyRequest, reply: FastifyReply) => {
      if (err instanceof DomainError) {
        return reply.status(err.status).send({
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof ZodError) {
        return reply.status(422).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La petición no cumple el esquema',
            issues: err.flatten(),
          },
        });
      }
      const fe = err as FastifyError;
      if (typeof fe.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
        return reply
          .status(fe.statusCode)
          .send({ error: { code: fe.code ?? 'BAD_REQUEST', message: fe.message } });
      }
      logger.error({ err: err.message, stack: err.stack }, 'Unhandled error');
      return reply.status(500).send({
        error: { code: 'INTERNAL', message: 'Error interno del servidor' },
      });
    },
  );
}
