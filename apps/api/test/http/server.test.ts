import { createServer as createHttpServer, get as httpGet, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Logger } from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 0,
    LOG_LEVEL: 'info',
  },
}));

import { env } from '../../src/config/env.js';
import { createLogger, logger as defaultLogger } from '../../src/config/logger.js';
import type { DatabaseLifecycle } from '../../src/database/prisma.js';
import {
  main,
  registerShutdownHandlers,
  startServer,
  type ServerHandle,
  type SignalTarget,
  type StartServerOptions,
} from '../../src/server.js';

interface LogEntry {
  level: string;
  msg: string;
  [key: string]: unknown;
}

function createCapturedLogger(): { logger: Logger; entries: () => LogEntry[] } {
  const logs: LogEntry[] = [];
  const destination = {
    write(chunk: string): void {
      logs.push(JSON.parse(chunk) as LogEntry);
    },
  };

  return {
    logger: createLogger(destination),
    entries: () => logs,
  };
}

const openHandles: ServerHandle[] = [];

async function startTestServer(
  logger: Logger,
  options: Omit<StartServerOptions, 'logger'> = {},
): Promise<ServerHandle> {
  const handle = await startServer({ ...options, logger });
  openHandles.push(handle);
  return handle;
}

async function occupyAvailablePort(): Promise<{ server: Server; port: number }> {
  const server = createHttpServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve());
  });

  const address = server.address() as AddressInfo;

  return { server, port: address.port };
}

async function getAvailablePort(): Promise<number> {
  const { server, port } = await occupyAvailablePort();
  await closeServer(server);
  return port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

class TestSignalTarget implements SignalTarget {
  private readonly listeners = new Map<NodeJS.Signals, Set<() => void>>();

  on(signal: NodeJS.Signals, listener: () => void): this {
    const listeners = this.listeners.get(signal) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(signal, listeners);
    return this;
  }

  off(signal: NodeJS.Signals, listener: () => void): this {
    this.listeners.get(signal)?.delete(listener);
    return this;
  }

  emit(signal: NodeJS.Signals): void {
    for (const listener of [...(this.listeners.get(signal) ?? [])]) {
      listener();
    }
  }

  listenerCount(signal: NodeJS.Signals): number {
    return this.listeners.get(signal)?.size ?? 0;
  }
}

function createDatabaseLifecycle(overrides: Partial<DatabaseLifecycle> = {}): DatabaseLifecycle {
  return {
    connect: overrides.connect ?? vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    disconnect: overrides.disconnect ?? vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

function createSignalHandle(): {
  handle: ServerHandle;
  shutdown: ReturnType<typeof vi.fn>;
} {
  const shutdown = vi.fn(() => Promise.resolve());

  return {
    handle: {
      server: {} as Server,
      port: 3000,
      shutdown,
    },
    shutdown,
  };
}

beforeEach(() => {
  env.PORT = 0;
});

afterEach(async () => {
  while (openHandles.length > 0) {
    const handle = openHandles.pop();
    await handle?.shutdown('test-cleanup');
  }
});

describe('server lifecycle', () => {
  it('starts on an available port and serves /health', async () => {
    const { logger, entries } = createCapturedLogger();
    const handle = await startTestServer(logger);

    const response = await request(handle.server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(handle.port).toBeGreaterThan(0);
    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'HTTP server started',
        port: handle.port,
        service: 'EventPulse Analytics API',
      }),
    );
  });

  it('uses env.PORT for the listening port', async () => {
    const expectedPort = await getAvailablePort();
    env.PORT = expectedPort;
    const { logger } = createCapturedLogger();

    const handle = await startTestServer(logger);

    expect(handle.port).toBe(expectedPort);
    expect(handle.server.address()).toEqual(expect.objectContaining({ port: expectedPort }));
  });

  it('closes the server during graceful shutdown', async () => {
    const { logger, entries } = createCapturedLogger();
    const handle = await startTestServer(logger);

    await handle.shutdown('test');

    expect(handle.server.listening).toBe(false);
    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'HTTP server shutdown completed',
        port: handle.port,
      }),
    );
  });

  it('connects the database before shutdown and disconnects after the HTTP server closes', async () => {
    const { logger, entries } = createCapturedLogger();
    const connect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const disconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const handle = await startTestServer(logger, {
      database: createDatabaseLifecycle({ connect, disconnect }),
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'Database connection established',
      }),
    );

    await handle.shutdown('database-test');

    expect(handle.server.listening).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'info',
        msg: 'Database connection closed',
        port: handle.port,
      }),
    );
  });

  it('rejects startup when the database connection fails', async () => {
    const { logger, entries } = createCapturedLogger();
    const failure = new Error('database unavailable');
    const connect = vi.fn<() => Promise<void>>().mockRejectedValue(failure);
    const disconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      startServer({
        logger,
        database: createDatabaseLifecycle({ connect, disconnect }),
      }),
    ).rejects.toBe(failure);

    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'fatal',
        msg: 'Database connection failed',
      }),
    );
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('logs database disconnection failures without blocking shutdown', async () => {
    const { logger, entries } = createCapturedLogger();
    const failure = new Error('disconnect failed');
    const disconnect = vi.fn<() => Promise<void>>().mockRejectedValue(failure);
    const handle = await startTestServer(logger, {
      database: createDatabaseLifecycle({ disconnect }),
    });

    await expect(handle.shutdown('disconnect-failure-test')).resolves.toBeUndefined();

    expect(handle.server.listening).toBe(false);
    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'Database disconnection failed',
        port: handle.port,
      }),
    );
  });

  it('does not close concurrently when shutdown is requested multiple times', async () => {
    const { logger } = createCapturedLogger();
    const handle = await startTestServer(logger);
    const closeSpy = vi.spyOn(handle.server, 'close');

    const firstShutdown = handle.shutdown('first');
    const secondShutdown = handle.shutdown('second');

    expect(secondShutdown).toBe(firstShutdown);
    await firstShutdown;

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(handle.server.listening).toBe(false);
  });

  it('allows in-flight requests to complete during shutdown', async () => {
    const { logger } = createCapturedLogger();
    const app = express();
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });

    app.get('/slow', (_req, res) => {
      markRequestStarted();
      setTimeout(() => {
        res.status(200).json({ status: 'completed' });
      }, 30);
    });

    const handle = await startTestServer(logger, { app, shutdownTimeoutMs: 500 });
    const responsePromise = request(handle.server)
      .get('/slow')
      .then((response) => response);

    await requestStarted;
    const shutdownPromise = handle.shutdown('in-flight-test');
    const response = await responsePromise;
    await shutdownPromise;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'completed' });
    expect(handle.server.listening).toBe(false);
  });

  it('forces remaining connections closed after the shutdown timeout', async () => {
    const { logger, entries } = createCapturedLogger();
    const app = express();
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });

    app.get('/hold', () => {
      markRequestStarted();
    });

    const handle = await startTestServer(logger, { app, shutdownTimeoutMs: 25 });
    const clientRequest = httpGet({
      host: '127.0.0.1',
      port: handle.port,
      path: '/hold',
    });
    clientRequest.on('error', () => {});

    await requestStarted;
    await handle.shutdown('timeout-test');

    expect(handle.server.listening).toBe(false);
    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        msg: 'HTTP server shutdown timed out; forcing remaining connections to close',
        port: handle.port,
        timeoutMs: 25,
      }),
    );
    await vi.waitFor(() => {
      expect(clientRequest.destroyed).toBe(true);
    });
  });

  it('logs server errors emitted after startup', async () => {
    const { logger, entries } = createCapturedLogger();
    const handle = await startTestServer(logger);

    handle.server.emit('error', new Error('server failure'));

    expect(entries()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        msg: 'HTTP server error',
        port: handle.port,
      }),
    );
  });

  it('logs and rejects when the configured port cannot be bound', async () => {
    const blocker = await occupyAvailablePort();
    const { logger, entries } = createCapturedLogger();

    try {
      env.PORT = blocker.port;

      await expect(startServer({ logger })).rejects.toMatchObject({ code: 'EADDRINUSE' });

      expect(entries()).toContainEqual(
        expect.objectContaining({
          level: 'fatal',
          msg: 'Failed to start HTTP server',
          port: blocker.port,
        }),
      );
    } finally {
      await closeServer(blocker.server);
    }
  });

  it('sets a non-zero exit code when the server cannot start', async () => {
    const blocker = await occupyAvailablePort();
    const previousExitCode = process.exitCode;
    const previousLogLevel = defaultLogger.level;
    const connect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const disconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    try {
      env.PORT = blocker.port;
      defaultLogger.level = 'silent';

      await main({ database: createDatabaseLifecycle({ connect, disconnect }) });

      expect(process.exitCode).toBe(1);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      process.exitCode = previousExitCode;
      defaultLogger.level = previousLogLevel;
      await closeServer(blocker.server);
    }
  });
});

describe('shutdown signals', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)(
    'shuts down on %s and removes signal listeners',
    async (signal) => {
      const { logger, entries } = createCapturedLogger();
      const { handle, shutdown } = createSignalHandle();
      const signalTarget = new TestSignalTarget();
      const cleanup = registerShutdownHandlers(handle, { logger, signalTarget });

      expect(signalTarget.listenerCount('SIGTERM')).toBe(1);
      expect(signalTarget.listenerCount('SIGINT')).toBe(1);

      signalTarget.emit(signal);

      await vi.waitFor(() => {
        expect(shutdown).toHaveBeenCalledWith(`signal:${signal}`);
        expect(signalTarget.listenerCount('SIGTERM')).toBe(0);
        expect(signalTarget.listenerCount('SIGINT')).toBe(0);
      });

      expect(entries()).toContainEqual(
        expect.objectContaining({
          level: 'info',
          msg: 'Shutdown signal received',
          signal,
        }),
      );

      cleanup();
    },
  );
});
