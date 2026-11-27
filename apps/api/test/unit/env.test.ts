import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.schema.js';

const DATABASE_URL = 'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse?schema=public';
const DATABASE_RUNTIME_URL =
  'postgresql://eventpulse_runtime:secret@localhost:5432/eventpulse?schema=public';
const JWT_ACCESS_SECRET = 'production-jwt-secret-at-least-32-characters';
const REFRESH_TOKEN_PEPPER = 'production-refresh-pepper-at-least-32-chars';
const PASSWORD_RESET_TOKEN_PEPPER = 'production-reset-pepper-at-least-32-chars';
const INVITATION_TOKEN_PEPPER = 'production-invitation-pepper-at-least-32-chars';
const API_KEY_PEPPER = 'production-api-key-pepper-at-least-32-chars';
const CORS_ALLOWED_ORIGINS = 'https://app.eventpulse.example';
const REDIS_URL = 'redis://localhost:6379';

const productionAuthEnv = {
  DATABASE_RUNTIME_URL,
  JWT_ACCESS_SECRET,
  REFRESH_TOKEN_PEPPER,
  PASSWORD_RESET_TOKEN_PEPPER,
  INVITATION_TOKEN_PEPPER,
  API_KEY_PEPPER,
  CORS_ALLOWED_ORIGINS,
  REDIS_URL,
};

const defaultAuthConfig = {
  JWT_ACCESS_SECRET: 'development-only-jwt-secret-change-before-production',
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_ISSUER: 'eventpulse-analytics',
  JWT_AUDIENCE: 'eventpulse-api',
  JWT_KEY_ID: 'primary',
  REFRESH_TOKEN_PEPPER: 'development-only-refresh-pepper-change-before-production',
  PASSWORD_RESET_TOKEN_PEPPER: 'development-only-reset-pepper-change-before-production',
  INVITATION_TOKEN_PEPPER: 'development-only-invitation-pepper-change-before-production',
  API_KEY_PEPPER: 'development-only-api-key-pepper-change-before-production',
  REFRESH_SLIDING_TTL_SECONDS: 604_800,
  SESSION_ABSOLUTE_TTL_SECONDS: 2_592_000,
  PASSWORD_RESET_TTL_SECONDS: 1_800,
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
  INVITATION_ACCEPT_MAX_ATTEMPTS: 20,
  INVITATION_ACCEPT_WINDOW_SECONDS: 900,
} as const;

describe('parseEnv', () => {
  it('accepts a valid configuration', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'debug',
        DATABASE_URL,
        DATABASE_POOL_SIZE: '7',
        ...productionAuthEnv,
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'debug',
      DATABASE_URL,
      DATABASE_RUNTIME_URL,
      DATABASE_POOL_SIZE: 7,
      ...defaultAuthConfig,
      JWT_ACCESS_SECRET,
      REFRESH_TOKEN_PEPPER,
      PASSWORD_RESET_TOKEN_PEPPER,
      INVITATION_TOKEN_PEPPER,
      API_KEY_PEPPER,
      CORS_ALLOWED_ORIGINS,
      REDIS_URL,
      AUTH_COOKIE_SECURE: true,
    });
  });

  it('requires DATABASE_RUNTIME_URL in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', DATABASE_URL })).toThrow(
      /DATABASE_RUNTIME_URL/,
    );
  });

  it('allows the owner URL fallback outside production', () => {
    const env = parseEnv({ NODE_ENV: 'development', DATABASE_URL });

    expect(env.DATABASE_RUNTIME_URL).toBeUndefined();
  });

  it('rejects a non-PostgreSQL DATABASE_RUNTIME_URL', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL,
        DATABASE_RUNTIME_URL: 'mysql://localhost:3306/eventpulse',
      }),
    ).toThrow(/DATABASE_RUNTIME_URL/);
  });

  it('applies default values to optional variables', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      DATABASE_POOL_SIZE: 10,
      ...defaultAuthConfig,
      AUTH_COOKIE_SECURE: false,
    });
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('converts PORT and DATABASE_POOL_SIZE to numbers', () => {
    const env = parseEnv({ PORT: '4000', DATABASE_URL, DATABASE_POOL_SIZE: '5' });

    expect(env.PORT).toBe(4000);
    expect(typeof env.PORT).toBe('number');
    expect(env.DATABASE_POOL_SIZE).toBe(5);
    expect(typeof env.DATABASE_POOL_SIZE).toBe('number');
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging', DATABASE_URL })).toThrow(/NODE_ENV/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => parseEnv({ PORT: 'not-a-port', DATABASE_URL })).toThrow(/PORT/);
  });

  it('rejects a decimal PORT', () => {
    expect(() => parseEnv({ PORT: '3000.5', DATABASE_URL })).toThrow(/PORT/);
  });

  it('rejects a PORT below 1', () => {
    expect(() => parseEnv({ PORT: '0', DATABASE_URL })).toThrow(/PORT/);
  });

  it('rejects a PORT above 65535', () => {
    expect(() => parseEnv({ PORT: '65536', DATABASE_URL })).toThrow(/PORT/);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => parseEnv({ LOG_LEVEL: 'verbose', DATABASE_URL })).toThrow(/LOG_LEVEL/);
  });

  it('rejects a malformed DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-PostgreSQL DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost:3306/eventpulse' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it.each(['0', '-1', '1.5', 'not-a-number', '101'])(
    'rejects an invalid DATABASE_POOL_SIZE: %s',
    (DATABASE_POOL_SIZE) => {
      expect(() => parseEnv({ DATABASE_URL, DATABASE_POOL_SIZE })).toThrow(/DATABASE_POOL_SIZE/);
    },
  );

  it('accepts the maximum DATABASE_POOL_SIZE', () => {
    expect(parseEnv({ DATABASE_URL, DATABASE_POOL_SIZE: '100' }).DATABASE_POOL_SIZE).toBe(100);
  });

  it('requires auth secrets in production', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL, ...productionAuthEnv };

    for (const name of [
      'JWT_ACCESS_SECRET',
      'REFRESH_TOKEN_PEPPER',
      'PASSWORD_RESET_TOKEN_PEPPER',
      'INVITATION_TOKEN_PEPPER',
      'API_KEY_PEPPER',
    ] as const) {
      const withoutSecret: Record<string, string | undefined> = { ...base };
      delete withoutSecret[name];

      expect(() => parseEnv(withoutSecret)).toThrow(new RegExp(name));
    }
  });

  it('rejects development secrets in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL,
        ...productionAuthEnv,
        JWT_ACCESS_SECRET: 'development-only-jwt-secret-change-before-production',
      }),
    ).toThrow(/Development-only secrets/);
  });

  it('requires REDIS_URL in production', () => {
    const env: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      DATABASE_URL,
      ...productionAuthEnv,
    };
    delete env.REDIS_URL;

    expect(() => parseEnv(env)).toThrow(/REDIS_URL/);
  });

  it('requires CORS_ALLOWED_ORIGINS in production', () => {
    const withoutCors: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      DATABASE_URL,
      ...productionAuthEnv,
    };
    delete withoutCors.CORS_ALLOWED_ORIGINS;

    expect(() => parseEnv(withoutCors)).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('rejects fail-open rate limiting in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL,
        ...productionAuthEnv,
        AUTH_RATE_LIMIT_FAIL_CLOSED: 'false',
      }),
    ).toThrow(/AUTH_RATE_LIMIT_FAIL_CLOSED/);
  });

  it('allows explicit fail-open rate limiting outside production', () => {
    expect(
      parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL,
        AUTH_RATE_LIMIT_FAIL_CLOSED: 'false',
      }).AUTH_RATE_LIMIT_FAIL_CLOSED,
    ).toBe(false);
  });

  it('rejects an insecure auth cookie in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL,
        ...productionAuthEnv,
        AUTH_COOKIE_SECURE: 'false',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('rejects wildcard CORS origins when credentials are enabled', () => {
    expect(() => parseEnv({ DATABASE_URL, CORS_ALLOWED_ORIGINS: '*' })).toThrow(/Wildcard origins/);
  });

  it('rejects a non-HTTP CORS origin', () => {
    expect(() => parseEnv({ DATABASE_URL, CORS_ALLOWED_ORIGINS: 'ftp://example.com' })).toThrow(
      /Invalid origin/,
    );
  });

  it('accepts a valid cookie domain with or without a leading dot', () => {
    expect(
      parseEnv({ DATABASE_URL, AUTH_COOKIE_DOMAIN: '.eventpulse.example' }).AUTH_COOKIE_DOMAIN,
    ).toBe('.eventpulse.example');
    expect(
      parseEnv({ DATABASE_URL, AUTH_COOKIE_DOMAIN: 'eventpulse.example' }).AUTH_COOKIE_DOMAIN,
    ).toBe('eventpulse.example');
  });

  it.each([
    'https://eventpulse.example',
    'eventpulse..example',
    '.',
    '-eventpulse.example',
    'eventpulse.example:3000',
    'eventpulse example',
  ])('rejects a malformed cookie domain: %s', (AUTH_COOKIE_DOMAIN) => {
    expect(() => parseEnv({ DATABASE_URL, AUTH_COOKIE_DOMAIN })).toThrow(/AUTH_COOKIE_DOMAIN/);
  });

  it('rejects an absolute session TTL shorter than the sliding TTL', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL,
        REFRESH_SLIDING_TTL_SECONDS: '2592000',
        SESSION_ABSOLUTE_TTL_SECONDS: '604800',
      }),
    ).toThrow(/SESSION_ABSOLUTE_TTL_SECONDS/);
  });

  it('rejects a lockout max below the lockout base', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL,
        AUTH_LOCKOUT_BASE_SECONDS: '3600',
        AUTH_LOCKOUT_MAX_SECONDS: '60',
      }),
    ).toThrow(/AUTH_LOCKOUT_MAX_SECONDS/);
  });
});
