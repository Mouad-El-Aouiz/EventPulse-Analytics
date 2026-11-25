import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { errorLogFields } from '../errors/error-logging.js';
import { env } from './env.js';

const SERVICE_NAME = 'EventPulse Analytics API';

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
] as const;

const redactPaths = SENSITIVE_FIELDS.flatMap((field) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  `*.*.*.${field}`,
]);

const loggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    service: SERVICE_NAME,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  serializers: {
    err: (error: unknown) => errorLogFields(error),
  },
} satisfies LoggerOptions;

export function createLogger(destination?: DestinationStream): Logger {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export const logger = createLogger();
