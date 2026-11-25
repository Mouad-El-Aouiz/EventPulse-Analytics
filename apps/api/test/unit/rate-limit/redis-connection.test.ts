import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeRedisClient {
  url: string;
  emit(event: string): boolean;
  quit(): Promise<void>;
  disconnect(): void;
}

const state = vi.hoisted(() => ({
  clients: [] as FakeRedisClient[],
  env: { REDIS_URL: 'redis://localhost:6379' as string | undefined },
}));

vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('node:events');

  class FakeRedis extends EventEmitter {
    constructor(readonly url: string) {
      super();
      state.clients.push(this);
    }

    async quit(): Promise<void> {}

    disconnect(): void {}
  }

  return { Redis: FakeRedis };
});

vi.mock('../../../src/config/env.js', () => ({ env: state.env }));
vi.mock('../../../src/config/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('shared Redis client lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    state.clients.length = 0;
    state.env.REDIS_URL = 'redis://localhost:6379';
  });

  it('reuses one client while it stays open', async () => {
    const { getSharedRedis } = await import('../../../src/shared/redis/redis-connection.js');

    expect(getSharedRedis()).toBe(getSharedRedis());
    expect(state.clients).toHaveLength(1);
  });

  it('drops a terminal client and creates a fresh one on the next request', async () => {
    const { getSharedRedis } = await import('../../../src/shared/redis/redis-connection.js');
    const terminal = getSharedRedis();

    terminal.emit('end');

    const recreated = getSharedRedis();

    expect(recreated).not.toBe(terminal);
    expect(state.clients).toHaveLength(2);
  });

  it('ignores late end events from a client that is no longer current', async () => {
    const { getSharedRedis } = await import('../../../src/shared/redis/redis-connection.js');
    const first = getSharedRedis();

    first.emit('end');
    const second = getSharedRedis();
    first.emit('end');

    expect(getSharedRedis()).toBe(second);
    expect(state.clients).toHaveLength(2);
  });

  it('clears the shared client on shutdown so a restart can reconnect', async () => {
    const { closeSharedRedis, getSharedRedis } =
      await import('../../../src/shared/redis/redis-connection.js');
    const first = getSharedRedis();

    await closeSharedRedis();
    const second = getSharedRedis();

    expect(second).not.toBe(first);
    expect(state.clients).toHaveLength(2);
  });

  it('refuses to create a client without REDIS_URL', async () => {
    state.env.REDIS_URL = undefined;
    const { getSharedRedis } = await import('../../../src/shared/redis/redis-connection.js');

    expect(() => getSharedRedis()).toThrow(/REDIS_URL/);
  });
});
