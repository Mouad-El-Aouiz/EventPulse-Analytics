import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.schema.js';

const DATABASE_URL = 'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse?schema=public';

describe('parseEnv', () => {
  it('accepts a valid configuration', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'debug',
        DATABASE_URL,
        DATABASE_POOL_SIZE: '7',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'debug',
      DATABASE_URL,
      DATABASE_POOL_SIZE: 7,
    });
  });

  it('applies default values to optional variables', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      DATABASE_POOL_SIZE: 10,
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

  it.each(['0', '-1', '1.5', 'not-a-number'])(
    'rejects an invalid DATABASE_POOL_SIZE: %s',
    (DATABASE_POOL_SIZE) => {
      expect(() => parseEnv({ DATABASE_URL, DATABASE_POOL_SIZE })).toThrow(/DATABASE_POOL_SIZE/);
    },
  );
});
