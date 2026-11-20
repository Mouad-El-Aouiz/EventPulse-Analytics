import { randomUUID } from 'node:crypto';
import { hrtime } from 'node:process';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { logger as defaultLogger } from '../config/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    log: Logger;
  }
}

const REQUEST_ID_HEADER = 'X-Request-Id';
const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const REQUEST_STARTED_MESSAGE = 'HTTP request started';
const REQUEST_COMPLETED_MESSAGE = 'HTTP request completed';

export interface RequestLoggerOptions {
  logger?: Logger;
}

export function resolveRequestId(candidate: string | undefined): string {
  if (
    candidate !== undefined &&
    candidate.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }

  return randomUUID();
}

export function requestLogger(options: RequestLoggerOptions = {}): RequestHandler {
  const baseLogger = options.logger ?? defaultLogger;

  return (req, res, next) => {
    const startedAt = hrtime.bigint();
    const method = req.method;
    const path = req.path;
    const requestId = resolveRequestId(req.get(REQUEST_ID_HEADER));

    req.requestId = requestId;
    req.log = baseLogger.child({ requestId });

    res.setHeader(REQUEST_ID_HEADER, requestId);

    req.log.info({ method, path }, REQUEST_STARTED_MESSAGE);

    res.once('finish', () => {
      const durationMs = Number(hrtime.bigint() - startedAt) / 1_000_000;

      req.log.info(
        {
          method,
          path,
          statusCode: res.statusCode,
          durationMs,
        },
        REQUEST_COMPLETED_MESSAGE,
      );
    });

    next();
  };
}
