import { afterEach, describe, expect, it, vi } from 'vitest';

const envConfigMock = vi.hoisted(() => vi.fn());

vi.mock('dotenv', () => ({
  default: {
    config: envConfigMock,
  },
}));

describe('env loader', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    envConfigMock.mockClear();
  });

  it('loads and validates process.env', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PORT', '4567');
    vi.stubEnv('LOG_LEVEL', 'warn');
    vi.stubEnv('DATABASE_URL', 'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse');
    vi.stubEnv('DATABASE_POOL_SIZE', '5');

    const { env } = await import('../../src/config/env.js');

    expect(env).toEqual({
      NODE_ENV: 'test',
      PORT: 4567,
      LOG_LEVEL: 'warn',
      DATABASE_URL: 'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse',
      DATABASE_POOL_SIZE: 5,
    });
    expect(envConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.any(URL),
        quiet: true,
      }),
    );
  });

  it('rejects an invalid process.env configuration', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PORT', 'invalid');
    vi.stubEnv('LOG_LEVEL', 'info');
    vi.stubEnv('DATABASE_URL', 'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse');

    await expect(import('../../src/config/env.js')).rejects.toThrow(/PORT/);
  });
});
