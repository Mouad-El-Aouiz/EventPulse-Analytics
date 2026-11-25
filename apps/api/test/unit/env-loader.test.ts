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
      JWT_ACCESS_SECRET: 'development-only-jwt-secret-change-before-production',
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_ISSUER: 'eventpulse-analytics',
      JWT_AUDIENCE: 'eventpulse-api',
      JWT_KEY_ID: 'primary',
      REFRESH_TOKEN_PEPPER: 'development-only-refresh-pepper-change-before-production',
      PASSWORD_RESET_TOKEN_PEPPER: 'development-only-reset-pepper-change-before-production',
      REFRESH_SLIDING_TTL_SECONDS: 604_800,
      SESSION_ABSOLUTE_TTL_SECONDS: 2_592_000,
      PASSWORD_RESET_TTL_SECONDS: 1_800,
      AUTH_COOKIE_SECURE: false,
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
      TRUST_PROXY_HOPS: 0,
      REDIS_KEY_PREFIX: 'eventpulse',
      AUTH_LOGIN_MAX_ATTEMPTS: 10,
      AUTH_LOGIN_WINDOW_SECONDS: 900,
      AUTH_FORGOT_MAX_ATTEMPTS: 5,
      AUTH_FORGOT_WINDOW_SECONDS: 3_600,
      AUTH_REFRESH_MAX_ATTEMPTS: 60,
      AUTH_REFRESH_WINDOW_SECONDS: 3_600,
      AUTH_LOCKOUT_THRESHOLD: 5,
      AUTH_LOCKOUT_BASE_SECONDS: 60,
      AUTH_LOCKOUT_MAX_SECONDS: 86_400,
      AUTH_RATE_LIMIT_FAIL_CLOSED: true,
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
