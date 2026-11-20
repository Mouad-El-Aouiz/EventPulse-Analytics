import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.schema.js';

describe('parseEnv', () => {
  it('accepts a valid configuration', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'debug',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'debug',
    });
  });

  it('applies default values when variables are missing', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('converts PORT to a number', () => {
    const env = parseEnv({ PORT: '4000' });

    expect(env.PORT).toBe(4000);
    expect(typeof env.PORT).toBe('number');
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => parseEnv({ PORT: 'not-a-port' })).toThrow(/PORT/);
  });

  it('rejects a decimal PORT', () => {
    expect(() => parseEnv({ PORT: '3000.5' })).toThrow(/PORT/);
  });

  it('rejects a PORT below 1', () => {
    expect(() => parseEnv({ PORT: '0' })).toThrow(/PORT/);
  });

  it('rejects a PORT above 65535', () => {
    expect(() => parseEnv({ PORT: '65536' })).toThrow(/PORT/);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => parseEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
