import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'info',
  },
}));

import type { Logger } from 'pino';
import { createLogger, logger as defaultLogger } from '../../src/config/logger.js';
import { requestLogger, resolveRequestId } from '../../src/middleware/request-logger.js';

type LogEntry = Record<string, unknown>;
type TestApp = ReturnType<typeof express>;

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TestContext {
  app: TestApp;
  entries: () => LogEntry[];
}

function createCapturedLogger(): { logger: Logger; entries: () => LogEntry[] } {
  const lines: string[] = [];

  const testLogger = createLogger({
    write(message: string): void {
      lines.push(message);
    },
  });

  return {
    logger: testLogger,
    entries: () => lines.map((line) => JSON.parse(line) as LogEntry),
  };
}

function createTestApp(testLogger: Logger): TestApp {
  const app = express();

  app.use(requestLogger({ logger: testLogger }));

  app.get('/api/v1/events', (req, res) => {
    res.status(201).json({
      requestId: req.requestId,
      hasLogger: typeof req.log.info === 'function',
    });
  });

  app.post('/api/v1/events', (req, res) => {
    res.status(202).json({ method: req.method });
  });

  return app;
}

function createTestContext(): TestContext {
  const { logger, entries } = createCapturedLogger();

  return {
    app: createTestApp(logger),
    entries,
  };
}

function getLogEntry(entries: LogEntry[], message: string): LogEntry {
  const entry = entries.find((candidate) => candidate.msg === message);

  if (!entry) {
    throw new Error(`Expected a log entry with message "${message}"`);
  }

  return entry;
}

function getNumberField(entry: LogEntry, field: string): number {
  const value = entry[field];

  if (typeof value !== 'number') {
    throw new Error(`Expected "${field}" to be a number`);
  }

  return value;
}

describe('requestLogger', () => {
  it('generates a request id when the header is absent', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/api/v1/events');

    expect(response.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('reuses a valid client-provided request id', async () => {
    const { app, entries } = createTestContext();

    const response = await request(app)
      .get('/api/v1/events')
      .set('X-Request-Id', 'client-request-123');

    expect(response.headers['x-request-id']).toBe('client-request-123');
    expect(response.body.requestId).toBe('client-request-123');
    expect(getLogEntry(entries(), 'HTTP request completed').requestId).toBe('client-request-123');
  });

  it('replaces an invalid client-provided request id', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .get('/api/v1/events')
      .set('X-Request-Id', 'invalid request id');

    expect(response.headers['x-request-id']).not.toBe('invalid request id');
    expect(response.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
  });

  it('returns the selected request id in the X-Request-Id response header', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .get('/api/v1/events')
      .set('X-Request-Id', 'response-header-id');

    expect(response.headers['x-request-id']).toBe('response-header-id');
  });

  it('includes the request id in request logs', async () => {
    const { app, entries } = createTestContext();

    const response = await request(app).get('/api/v1/events');
    const logs = entries();

    const started = getLogEntry(logs, 'HTTP request started');
    const completed = getLogEntry(logs, 'HTTP request completed');

    expect(started.requestId).toBe(response.headers['x-request-id']);
    expect(completed.requestId).toBe(response.headers['x-request-id']);
  });

  it('logs the start of a request', async () => {
    const { app, entries } = createTestContext();

    await request(app).get('/api/v1/events');

    const started = getLogEntry(entries(), 'HTTP request started');

    expect(started.method).toBe('GET');
    expect(started.path).toBe('/api/v1/events');
    expect(started.level).toBe('info');
  });

  it('logs the HTTP method and path', async () => {
    const { app, entries } = createTestContext();

    await request(app).post('/api/v1/events').send({ event: 'created' });

    const logs = entries();
    const started = getLogEntry(logs, 'HTTP request started');
    const completed = getLogEntry(logs, 'HTTP request completed');

    expect(started.method).toBe('POST');
    expect(started.path).toBe('/api/v1/events');
    expect(completed.method).toBe('POST');
    expect(completed.path).toBe('/api/v1/events');
  });

  it('logs the HTTP response status code', async () => {
    const { app, entries } = createTestContext();

    await request(app).get('/api/v1/events');

    const completed = getLogEntry(entries(), 'HTTP request completed');

    expect(completed.statusCode).toBe(201);
  });

  it('logs a valid processing duration in milliseconds', async () => {
    const { app, entries } = createTestContext();

    await request(app).get('/api/v1/events');

    const completed = getLogEntry(entries(), 'HTTP request completed');
    const durationMs = getNumberField(completed, 'durationMs');

    expect(Number.isFinite(durationMs)).toBe(true);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not log query parameters or sensitive request data', async () => {
    const { app, entries } = createTestContext();

    await request(app)
      .post('/api/v1/events?token=query-secret&email=user@example.com')
      .set('Authorization', 'Bearer header-secret')
      .set('Cookie', 'session=cookie-secret')
      .send({ password: 'body-secret' });

    const logs = entries();
    const serialized = JSON.stringify(logs);

    expect(getLogEntry(logs, 'HTTP request started').path).toBe('/api/v1/events');
    expect(getLogEntry(logs, 'HTTP request completed').path).toBe('/api/v1/events');
    expect(serialized).not.toContain('query-secret');
    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('header-secret');
    expect(serialized).not.toContain('cookie-secret');
    expect(serialized).not.toContain('body-secret');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('cookie');
    expect(serialized).not.toContain('password');
  });

  it('uses the central logger by default', async () => {
    const previousLevel = defaultLogger.level;
    const childSpy = vi.spyOn(defaultLogger, 'child');
    defaultLogger.level = 'silent';

    try {
      const app = express();

      app.use(requestLogger());
      app.get('/api/v1/events', (req, res) => {
        res.status(200).json({ requestId: req.requestId });
      });

      const response = await request(app).get('/api/v1/events');

      expect(childSpy).toHaveBeenCalledWith({ requestId: expect.any(String) });
      expect(response.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
    } finally {
      childSpy.mockRestore();
      defaultLogger.level = previousLevel;
    }
  });

  it('works as Express middleware with a route handler', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/api/v1/events');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      requestId: expect.any(String),
      hasLogger: true,
    });
  });
});

describe('resolveRequestId', () => {
  it('accepts a valid request id of exactly 128 characters', () => {
    const requestId = 'a'.repeat(128);

    expect(resolveRequestId(requestId)).toBe(requestId);
  });

  it('replaces a request id longer than 128 characters', () => {
    expect(resolveRequestId('a'.repeat(129))).toMatch(UUID_V4_PATTERN);
  });

  it('replaces a request id containing control characters', () => {
    expect(resolveRequestId('request\r\nid')).toMatch(UUID_V4_PATTERN);
  });
});
