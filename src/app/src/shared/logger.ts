/**
 * Logger pino configurable por entorno. En desarrollo se formatea con
 * `pino-pretty`; en producción se emite JSON line.
 */

import pino from 'pino';
import { config } from '../config.ts';

const isDev = config.NODE_ENV !== 'production';

export const logger = pino({
  level: config.LOG_LEVEL,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      }
    : {}),
});
