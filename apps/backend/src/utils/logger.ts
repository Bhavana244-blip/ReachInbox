import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  transport:
    config.env !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  // Redact sensitive fields
  redact: {
    paths: ['smtpPassword', 'accessToken', 'password', 'secret', 'req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
});
