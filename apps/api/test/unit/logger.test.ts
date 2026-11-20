import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'debug',
  },
}));

import { createLogger, logger } from '../../src/config/logger.js';

type LogEntry = Record<string, unknown>;

const SENSITIVE_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
] as const;

const sensitivePayload = Object.fromEntries(SENSITIVE_KEYS.map((key) => [key, `${key}-value`]));

const redactedPayload = Object.fromEntries(SENSITIVE_KEYS.map((key) => [key, '[REDACTED]']));

function createCapturedLogger() {
  const lines: string[] = [];

  const testLogger = createLogger({
    write(message: string): void {
      lines.push(message);
    },
  });

  return {
    testLogger,
    entries: () => lines.map((line) => JSON.parse(line) as LogEntry),
  };
}

function getSingleEntry(entries: LogEntry[]): LogEntry {
  expect(entries).toHaveLength(1);

  const entry = entries[0];

  if (!entry) {
    throw new Error('Expected a log entry');
  }

  return entry;
}

describe('logger', () => {
  it('creates the central logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('respects the level configured in env', () => {
    const { testLogger, entries } = createCapturedLogger();

    expect(testLogger.level).toBe('debug');

    testLogger.trace('trace message');
    testLogger.debug('debug message');

    const entry = getSingleEntry(entries());

    expect(entry).toMatchObject({
      level: 'debug',
      msg: 'debug message',
    });
  });

  it('includes the service field', () => {
    const { testLogger, entries } = createCapturedLogger();

    testLogger.info('service test');

    const entry = getSingleEntry(entries());

    expect(entry).toMatchObject({
      service: 'EventPulse Analytics API',
    });
  });

  it('includes an ISO 8601 timestamp', () => {
    const { testLogger, entries } = createCapturedLogger();

    testLogger.info('timestamp test');

    const entry = getSingleEntry(entries());
    const time = entry.time;

    if (typeof time !== 'string') {
      throw new Error('Expected an ISO timestamp string');
    }

    expect(new Date(time).toISOString()).toBe(time);
  });

  it('serializes logs as structured JSON', () => {
    const { testLogger, entries } = createCapturedLogger();

    testLogger.info(
      {
        module: 'example',
        metadata: { requestId: 'request-123' },
      },
      'Structured message',
    );

    const entry = getSingleEntry(entries());

    expect(entry).toMatchObject({
      level: 'info',
      msg: 'Structured message',
      module: 'example',
      metadata: { requestId: 'request-123' },
    });
  });

  it('redacts sensitive fields', () => {
    const { testLogger, entries } = createCapturedLogger();

    testLogger.info(
      {
        ...sensitivePayload,
        nested: { ...sensitivePayload },
        request: {
          body: {
            ...sensitivePayload,
            user: { ...sensitivePayload },
          },
          headers: {
            authorization: 'Bearer secret',
            cookie: 'session=secret',
          },
        },
      },
      'Sensitive payload',
    );

    const entry = getSingleEntry(entries());

    expect(entry).toMatchObject({
      ...redactedPayload,
      nested: redactedPayload,
      request: {
        body: {
          ...redactedPayload,
          user: redactedPayload,
        },
        headers: {
          authorization: '[REDACTED]',
          cookie: '[REDACTED]',
        },
      },
    });
  });
});
