import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { errorLogFields } from '../../errors/error-logging.js';

let sharedClient: Redis | undefined;

const MAX_RETRY_ATTEMPTS = 5;
const CONNECT_TIMEOUT_MS = 2000;

export function getSharedRedis(): Redis {
  if (env.REDIS_URL === undefined) {
    throw new Error('REDIS_URL is not configured');
  }

  if (sharedClient === undefined) {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: CONNECT_TIMEOUT_MS,
      retryStrategy(times: number): number | null {
        return times > MAX_RETRY_ATTEMPTS ? null : Math.min(times * 200, 2000);
      },
    });

    // Without these listeners ioredis would emit an unhandled EventEmitter
    // error; commands still reject and callers map that to fail-closed.
    client.on('error', (error: Error) => {
      logger.warn(errorLogFields(error), 'Redis connection error');
    });

    // After retry exhaustion ioredis emits 'end' and never reconnects on its
    // own. Clearing the terminal client lets the next request build a fresh
    // one instead of reusing a permanently closed connection.
    client.on('end', () => {
      if (sharedClient === client) {
        sharedClient = undefined;
      }

      logger.warn('Redis connection closed');
    });

    sharedClient = client;
  }

  return sharedClient;
}

export async function closeSharedRedis(): Promise<void> {
  if (sharedClient === undefined) {
    return;
  }

  const client = sharedClient;
  sharedClient = undefined;

  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
