import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import type { Express } from 'express';
import type { Logger } from 'pino';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger as defaultLogger } from './config/logger.js';
import { createPrismaDatabase, type DatabaseLifecycle } from './database/prisma.js';
import { errorLogFields, sanitizedErrorFields } from './errors/error-logging.js';
import { flushAuthAudits } from './modules/auth/auth.module.js';
import type { AuditFlushResult } from './modules/auth/auth.service.js';
import { getPasswordResetEmailStatus } from './shared/mail/mail-status.js';
import { closeSharedRedis } from './shared/redis/redis-connection.js';

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const DEFAULT_AUDIT_FLUSH_TIMEOUT_MS = 3_000;
const DEFAULT_SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

const SERVER_STARTED_MESSAGE = 'HTTP server started';
const SERVER_START_FAILED_MESSAGE = 'Failed to start HTTP server';
const SERVER_ERROR_MESSAGE = 'HTTP server error';
const SHUTDOWN_SIGNAL_RECEIVED_MESSAGE = 'Shutdown signal received';
const SHUTDOWN_STARTED_MESSAGE = 'HTTP server shutdown started';
const SHUTDOWN_TIMED_OUT_MESSAGE =
  'HTTP server shutdown timed out; forcing remaining connections to close';
const SHUTDOWN_COMPLETED_MESSAGE = 'HTTP server shutdown completed';
const SHUTDOWN_FAILED_MESSAGE = 'HTTP server shutdown failed';
const DATABASE_CONNECTED_MESSAGE = 'Database connection established';
const DATABASE_CONNECTION_FAILED_MESSAGE = 'Database connection failed';
const DATABASE_DISCONNECTED_MESSAGE = 'Database connection closed';
const DATABASE_DISCONNECT_FAILED_MESSAGE = 'Database disconnection failed';
const REDIS_DISCONNECTED_MESSAGE = 'Redis connection closed';
const REDIS_DISCONNECT_FAILED_MESSAGE = 'Redis disconnection failed';
const PASSWORD_RESET_EMAIL_DISABLED_MESSAGE = 'Password reset email delivery is disabled';
const AUDIT_FLUSH_COMPLETED_MESSAGE = 'Auth audit flush completed';
const AUDIT_FLUSH_TIMED_OUT_MESSAGE = 'Auth audit flush timed out';
const AUDIT_FLUSH_FAILED_MESSAGE = 'Auth audit flush failed';

export interface ServerHandle {
  readonly server: Server;
  readonly port: number;
  shutdown(reason?: string): Promise<void>;
}

export interface StartServerOptions {
  app?: Express;
  logger?: Logger;
  shutdownTimeoutMs?: number;
  database?: DatabaseLifecycle;
  flushAudits?: (timeoutMs: number) => Promise<AuditFlushResult>;
  auditFlushTimeoutMs?: number;
}

export interface SignalTarget {
  on(signal: NodeJS.Signals, listener: () => void): unknown;
  off(signal: NodeJS.Signals, listener: () => void): unknown;
}

export interface RegisterShutdownHandlersOptions {
  logger?: Logger;
  signals?: readonly NodeJS.Signals[];
  signalTarget?: SignalTarget;
}

interface ServerLifecycleOptions {
  logger: Logger;
  port: number;
  shutdownTimeoutMs: number;
  database?: DatabaseLifecycle;
  flushAudits?: (timeoutMs: number) => Promise<AuditFlushResult>;
  auditFlushTimeoutMs: number;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);

    try {
      server.listen(port);
    } catch (error) {
      server.off('error', onError);
      server.off('listening', onListening);
      reject(error);
    }
  });
}

function getListeningPort(server: Server): number {
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('HTTP server is not listening on a TCP port');
  }

  return address.port;
}

async function disconnectDatabase(
  database: DatabaseLifecycle | undefined,
  logger: Logger,
  port: number,
): Promise<void> {
  if (database === undefined) {
    return;
  }

  try {
    await database.disconnect();
    logger.info({ port }, DATABASE_DISCONNECTED_MESSAGE);
  } catch (error) {
    logger.error({ ...errorLogFields(error), port }, DATABASE_DISCONNECT_FAILED_MESSAGE);
  }
}

async function flushAuditTrail(
  flushAudits: ((timeoutMs: number) => Promise<AuditFlushResult>) | undefined,
  logger: Logger,
  port: number,
  timeoutMs: number,
): Promise<void> {
  if (flushAudits === undefined) {
    return;
  }

  try {
    const result = await flushAudits(timeoutMs);

    if (result.drained) {
      logger.info({ port }, AUDIT_FLUSH_COMPLETED_MESSAGE);
    } else {
      logger.warn({ port, pending: result.pending, timeoutMs }, AUDIT_FLUSH_TIMED_OUT_MESSAGE);
    }
  } catch (error) {
    // Audit failures are security-sensitive: never emit raw DB messages that may
    // embed connection strings or tokens.
    logger.error({ ...sanitizedErrorFields(error), port }, AUDIT_FLUSH_FAILED_MESSAGE);
  }
}

async function disconnectRedis(logger: Logger, port: number): Promise<void> {
  try {
    await closeSharedRedis();
    logger.info({ port }, REDIS_DISCONNECTED_MESSAGE);
  } catch (error) {
    logger.error({ ...errorLogFields(error), port }, REDIS_DISCONNECT_FAILED_MESSAGE);
  }
}

function createServerHandle(server: Server, options: ServerLifecycleOptions): ServerHandle {
  let shutdownPromise: Promise<void> | undefined;

  const onServerError = (error: Error): void => {
    options.logger.error({ ...errorLogFields(error), port: options.port }, SERVER_ERROR_MESSAGE);
  };

  server.on('error', onServerError);

  return {
    server,
    port: options.port,
    shutdown(reason = 'manual'): Promise<void> {
      if (shutdownPromise) {
        return shutdownPromise;
      }

      shutdownPromise = new Promise<void>((resolve) => {
        options.logger.info({ reason, port: options.port }, SHUTDOWN_STARTED_MESSAGE);

        let timeout: NodeJS.Timeout | undefined = setTimeout(() => {
          options.logger.warn(
            { port: options.port, timeoutMs: options.shutdownTimeoutMs },
            SHUTDOWN_TIMED_OUT_MESSAGE,
          );
          server.closeAllConnections();
        }, options.shutdownTimeoutMs);

        timeout.unref();

        server.close((error) => {
          if (timeout) {
            clearTimeout(timeout);
            timeout = undefined;
          }

          server.off('error', onServerError);

          if (error) {
            options.logger.error(
              { ...errorLogFields(error), port: options.port },
              SHUTDOWN_FAILED_MESSAGE,
            );
          } else {
            options.logger.info({ port: options.port }, SHUTDOWN_COMPLETED_MESSAGE);
          }

          void (async () => {
            await flushAuditTrail(
              options.flushAudits,
              options.logger,
              options.port,
              options.auditFlushTimeoutMs,
            );
            await disconnectDatabase(options.database, options.logger, options.port);
            await disconnectRedis(options.logger, options.port);
            resolve();
          })();
        });

        server.closeIdleConnections();
      });

      return shutdownPromise;
    },
  };
}

export async function startServer(options: StartServerOptions = {}): Promise<ServerHandle> {
  const logger = options.logger ?? defaultLogger;
  const app = options.app ?? createApp({ logger });
  const requestedPort = env.PORT;
  const server = createServer(app);
  const database = options.database;
  const passwordResetEmail = getPasswordResetEmailStatus();

  if (!passwordResetEmail.deliveryEnabled) {
    logger.warn(
      { port: requestedPort, ...passwordResetEmail },
      PASSWORD_RESET_EMAIL_DISABLED_MESSAGE,
    );
  }

  if (database !== undefined) {
    try {
      await database.connect();
      logger.info(DATABASE_CONNECTED_MESSAGE);
    } catch (error) {
      logger.fatal(errorLogFields(error), DATABASE_CONNECTION_FAILED_MESSAGE);
      throw error;
    }
  }

  try {
    await listen(server, requestedPort);
  } catch (error) {
    logger.fatal({ ...errorLogFields(error), port: requestedPort }, SERVER_START_FAILED_MESSAGE);
    await disconnectDatabase(database, logger, requestedPort);
    throw error;
  }

  const handle = createServerHandle(server, {
    logger,
    port: getListeningPort(server),
    shutdownTimeoutMs: options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    database,
    flushAudits: options.flushAudits ?? flushAuthAudits,
    auditFlushTimeoutMs: options.auditFlushTimeoutMs ?? DEFAULT_AUDIT_FLUSH_TIMEOUT_MS,
  });

  logger.info({ port: handle.port }, SERVER_STARTED_MESSAGE);

  return handle;
}

export function registerShutdownHandlers(
  handle: ServerHandle,
  options: RegisterShutdownHandlersOptions = {},
): () => void {
  const logger = options.logger ?? defaultLogger;
  const signals = options.signals ?? DEFAULT_SHUTDOWN_SIGNALS;
  const signalTarget = options.signalTarget ?? process;
  const handlers = new Map<NodeJS.Signals, () => void>();
  let cleanedUp = false;

  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;

    for (const [signal, handler] of handlers) {
      signalTarget.off(signal, handler);
    }

    handlers.clear();
  };

  for (const signal of signals) {
    const handler = (): void => {
      logger.info({ signal }, SHUTDOWN_SIGNAL_RECEIVED_MESSAGE);

      void handle
        .shutdown(`signal:${signal}`)
        .catch((error: unknown) => {
          logger.error({ ...errorLogFields(error), signal }, SHUTDOWN_FAILED_MESSAGE);
        })
        .finally(cleanup);
    };

    handlers.set(signal, handler);
    signalTarget.on(signal, handler);
  }

  return cleanup;
}

export async function main(options: StartServerOptions = {}): Promise<void> {
  const logger = options.logger ?? defaultLogger;
  let handle: ServerHandle;

  try {
    const database = options.database ?? createPrismaDatabase();
    handle = await startServer({ ...options, logger, database });
  } catch {
    process.exitCode = 1;
    return;
  }

  registerShutdownHandlers(handle, { logger });
}

const entrypoint = process.argv[1];

if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
