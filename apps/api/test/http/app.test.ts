import express, { type ErrorRequestHandler, type Express } from 'express';
import pino, { type Logger } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
  },
}));

import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { logger as defaultLogger } from '../../src/config/logger.js';
import { AppError } from '../../src/errors/app-error.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { requestLogger } from '../../src/middleware/request-logger.js';

type LogEntry = Record<string, unknown>;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVELOPMENT_ORIGIN = 'http://localhost:5173';
const UNKNOWN_ORIGIN = 'https://evil.example';
const PROBLEM_DETAILS_CONTENT_TYPE = 'application/problem+json';

function createCapturedLogger(): { logger: Logger; entries: () => LogEntry[] } {
  const lines: string[] = [];

  const logger = pino(
    {
      level: 'info',
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    {
      write(message: string): void {
        lines.push(message);
      },
    },
  );

  return {
    logger,
    entries: () => lines.map((line) => JSON.parse(line) as LogEntry),
  };
}

function createTestContext(): { app: Express; entries: () => LogEntry[] } {
  const { logger, entries } = createCapturedLogger();

  return {
    app: createApp({ logger }),
    entries,
  };
}

function createErrorTestApp(logger: Logger): Express {
  const app = express();

  app.use(requestLogger({ logger }));

  app.get('/app-error', () => {
    throw new AppError('Business rule failed', {
      statusCode: 422,
      code: 'BUSINESS_RULE_FAILED',
      publicDetail: 'The request cannot be processed.',
    });
  });

  app.get('/unexpected-error', () => {
    throw new Error('internal failure at /srv/app/secret.ts');
  });

  app.get('/non-error', () => {
    throw { reason: 'raw failure' };
  });

  app.use(errorHandler);

  return app;
}

function createFallbackErrorTestApp(): Express {
  const app = express();

  app.get('/unexpected-error', () => {
    throw new Error('fallback failure');
  });

  app.use(errorHandler);

  return app;
}

function getLogEntry(entries: LogEntry[], message: string): LogEntry {
  const entry = entries.find((candidate) => candidate.msg === message);

  if (!entry) {
    throw new Error(`Expected a log entry with message "${message}"`);
  }

  return entry;
}

beforeEach(() => {
  env.NODE_ENV = 'test';
});

describe('createApp', () => {
  it('returns a working Express application without listening on a port', async () => {
    const { app } = createTestContext();

    expect(typeof app).toBe('function');
    expect(typeof app.use).toBe('function');

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });

  it('uses the default logger when no logger is provided', async () => {
    const app = createApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns a stable 200 JSON response', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not expose sensitive information', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health');
    const serialized = JSON.stringify(response.body);

    expect(Object.keys(response.body)).toEqual(['status']);
    expect(serialized).not.toContain('NODE_ENV');
    expect(serialized).not.toContain('PORT');
    expect(serialized).not.toContain('LOG_LEVEL');
    expect(serialized).not.toContain('EventPulse-Analytics');
    expect(serialized).not.toContain('node_modules');
    expect(serialized).not.toContain('stack');
  });
});

describe('request ID', () => {
  it('generates a request id when the header is missing', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
  });

  it('preserves a valid client request id', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health').set('X-Request-Id', 'client-request-123');

    expect(response.headers['x-request-id']).toBe('client-request-123');
  });

  it('replaces an invalid client request id', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health').set('X-Request-Id', 'invalid request id');

    expect(response.headers['x-request-id']).not.toBe('invalid request id');
    expect(response.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
  });

  it('makes the request id available in logs', async () => {
    const { app, entries } = createTestContext();

    const response = await request(app).get('/health');
    const logs = entries();
    const started = getLogEntry(logs, 'HTTP request started');
    const completed = getLogEntry(logs, 'HTTP request completed');

    expect(started.requestId).toBe(response.headers['x-request-id']);
    expect(completed.requestId).toBe(response.headers['x-request-id']);
  });
});

describe('security headers', () => {
  it('applies Helmet security headers by default', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('allows the configured non-production origin without credentials', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health').set('Origin', DEVELOPMENT_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(DEVELOPMENT_ORIGIN);
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not allow an unknown origin', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health').set('Origin', UNKNOWN_ORIGIN);
    const preflight = await request(app)
      .options('/health')
      .set('Origin', UNKNOWN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('returns the configured methods and headers for preflight requests', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .options('/health')
      .set('Origin', DEVELOPMENT_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,x-request-id');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(DEVELOPMENT_ORIGIN);
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
    expect(response.headers['access-control-allow-headers']).toBe(
      'Content-Type,Authorization,X-Request-Id',
    );
    expect(response.headers['access-control-max-age']).toBe('600');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('denies all cross-origin access in production', async () => {
    env.NODE_ENV = 'production';

    const { app } = createTestContext();
    const response = await request(app).get('/health').set('Origin', DEVELOPMENT_ORIGIN);
    const preflight = await request(app)
      .options('/health')
      .set('Origin', DEVELOPMENT_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-methods']).toBeUndefined();
    expect(preflight.headers['access-control-allow-headers']).toBeUndefined();
  });
});

describe('JSON body parsing', () => {
  it('accepts valid JSON bodies', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .get('/health')
      .set('Content-Type', 'application/json')
      .send({ probe: 'ok' });

    expect(response.status).toBe(200);
  });

  it('returns Problem Details for malformed JSON without logging the body', async () => {
    const { app, entries } = createTestContext();

    const response = await request(app)
      .post('/invalid-json?token=query-secret')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer header-secret')
      .set('Cookie', 'session=cookie-secret')
      .set('X-Request-Id', 'malformed-json-id')
      .send('{"password":"body-secret",');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      code: 'INVALID_JSON',
      detail: 'The request body contains invalid JSON.',
      instance: '/invalid-json',
      requestId: 'malformed-json-id',
    });

    const serializedResponse = JSON.stringify(response.body);
    const serializedLogs = JSON.stringify(entries());
    const failed = getLogEntry(entries(), 'HTTP request failed');

    expect(serializedResponse).not.toContain('body-secret');
    expect(serializedResponse).not.toContain('query-secret');
    expect(serializedResponse).not.toContain('header-secret');
    expect(serializedResponse).not.toContain('cookie-secret');
    expect(failed.level).toBe('warn');
    expect(failed.errorName).toBe('AppError');
    expect(failed.errorMessage).toBe('Malformed JSON request body');
    expect(failed.errorCode).toBe('INVALID_JSON');
    expect(failed.statusCode).toBe(400);
    expect(failed.path).toBe('/invalid-json');
    expect(serializedLogs).not.toContain('body-secret');
    expect(serializedLogs).not.toContain('query-secret');
    expect(serializedLogs).not.toContain('header-secret');
    expect(serializedLogs).not.toContain('cookie-secret');
  });

  it('returns Problem Details when the payload exceeds the configured limit', async () => {
    const { app, entries } = createTestContext();

    const response = await request(app)
      .post('/too-large')
      .set('Content-Type', 'application/json')
      .send({ data: 'a'.repeat(120 * 1024) });

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Payload Too Large',
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      detail: 'The request payload exceeds the allowed limit.',
      instance: '/too-large',
    });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);

    const failed = getLogEntry(entries(), 'HTTP request failed');

    expect(failed.errorMessage).toBe('Request payload too large');
    expect(failed.errorCode).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('not found handling', () => {
  it('returns Problem Details for unknown routes without exposing the query string', async () => {
    const { app, entries } = createTestContext();

    const response = await request(app)
      .get('/api/v1/events?token=query-secret&email=user@example.com')
      .set('X-Request-Id', 'not-found-id');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      detail: 'The requested resource was not found.',
      instance: '/api/v1/events',
      requestId: 'not-found-id',
    });
    expect(response.body.instance).not.toContain('?');

    const serializedResponse = JSON.stringify(response.body);
    const serializedLogs = JSON.stringify(entries());
    const failed = getLogEntry(entries(), 'HTTP request failed');

    expect(serializedResponse).not.toContain('query-secret');
    expect(serializedResponse).not.toContain('user@example.com');
    expect(failed.level).toBe('warn');
    expect(failed.errorCode).toBe('ROUTE_NOT_FOUND');
    expect(failed.statusCode).toBe(404);
    expect(failed.path).toBe('/api/v1/events');
    expect(failed.requestId).toBe('not-found-id');
    expect(serializedLogs).not.toContain('query-secret');
    expect(serializedLogs).not.toContain('user@example.com');
  });
});

describe('global error handling', () => {
  it('maps AppError instances to Problem Details', async () => {
    const { logger, entries } = createCapturedLogger();
    const app = createErrorTestApp(logger);

    const response = await request(app)
      .get('/app-error?token=query-secret')
      .set('X-Request-Id', 'app-error-id');

    expect(response.status).toBe(422);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'The request cannot be processed.',
      instance: '/app-error',
      code: 'BUSINESS_RULE_FAILED',
      requestId: 'app-error-id',
    });
    expect(JSON.stringify(response.body)).not.toContain('Business rule failed');

    const failed = getLogEntry(entries(), 'HTTP request failed');

    expect(failed.level).toBe('warn');
    expect(failed.errorName).toBe('AppError');
    expect(failed.errorMessage).toBe('Business rule failed');
    expect(failed.errorCode).toBe('BUSINESS_RULE_FAILED');
    expect(failed.statusCode).toBe(422);
    expect(failed.isOperational).toBe(true);
    expect(failed.requestId).toBe('app-error-id');
  });

  it('returns a generic 500 for unexpected errors without leaking internals', async () => {
    const { logger, entries } = createCapturedLogger();
    const app = createErrorTestApp(logger);

    const response = await request(app)
      .get('/unexpected-error?token=query-secret')
      .set('Authorization', 'Bearer header-secret')
      .set('Cookie', 'session=cookie-secret');

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toContain(PROBLEM_DETAILS_CONTENT_TYPE);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      instance: '/unexpected-error',
      requestId: response.headers['x-request-id'],
    });

    const serializedResponse = JSON.stringify(response.body);
    const serializedLogs = JSON.stringify(entries());
    const failed = getLogEntry(entries(), 'HTTP request failed');

    expect(serializedResponse).not.toContain('internal failure');
    expect(serializedResponse).not.toContain('/srv/app/secret.ts');
    expect(serializedResponse).not.toContain('stack');
    expect(failed.level).toBe('error');
    expect(failed.errorName).toBe('Error');
    expect(failed.errorMessage).toBe('internal failure at /srv/app/secret.ts');
    expect(failed.errorStack).toEqual(expect.stringContaining('internal failure'));
    expect(failed.errorCode).toBe('INTERNAL_SERVER_ERROR');
    expect(failed.statusCode).toBe(500);
    expect(failed.isOperational).toBe(false);
    expect(failed.path).toBe('/unexpected-error');
    expect(failed.requestId).toBe(response.headers['x-request-id']);
    expect(serializedLogs).not.toContain('query-secret');
    expect(serializedLogs).not.toContain('header-secret');
    expect(serializedLogs).not.toContain('cookie-secret');
  });

  it('handles non-Error thrown values as internal errors', async () => {
    const { logger, entries } = createCapturedLogger();
    const app = createErrorTestApp(logger);

    const response = await request(app).get('/non-error');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      instance: '/non-error',
    });

    const failed = getLogEntry(entries(), 'HTTP request failed');

    expect(failed.level).toBe('error');
    expect(failed.errorName).toBe('object');
    expect(failed.errorMessage).toBeUndefined();
    expect(failed.errorStack).toBeUndefined();
    expect(failed.isOperational).toBe(false);
  });

  it('falls back to the central logger when req.log is unavailable', async () => {
    const previousLevel = defaultLogger.level;
    defaultLogger.level = 'silent';
    const errorSpy = vi.spyOn(defaultLogger, 'error');

    try {
      const app = createFallbackErrorTestApp();

      const response = await request(app).get('/unexpected-error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        instance: '/unexpected-error',
      });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      defaultLogger.level = previousLevel;
    }
  });

  it('delegates to Express when response headers have already been sent', async () => {
    const { logger, entries } = createCapturedLogger();
    const app = express();

    app.use(requestLogger({ logger }));
    app.get('/late-error', (_req, res, next) => {
      res.status(200).send('partial response');
      next(new Error('late failure'));
    });
    app.use(errorHandler);

    const suppressUnhandledError: ErrorRequestHandler = (_error, _req, res, next) => {
      if (!res.headersSent) {
        next(_error);
      }
    };

    app.use(suppressUnhandledError);

    const response = await request(app).get('/late-error');

    expect(response.status).toBe(200);
    expect(response.text).toBe('partial response');

    const failed = getLogEntry(entries(), 'HTTP request failed');

    expect(failed.level).toBe('error');
    expect(failed.errorMessage).toBe('late failure');
  });
});
