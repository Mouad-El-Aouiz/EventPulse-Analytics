import { version } from 'node:process';
import { describe, expect, it } from 'vitest';
import { getRuntimeInfo } from '../../src/index.js';

describe('getRuntimeInfo', () => {
  it('returns the service name and the current Node.js version', () => {
    expect(getRuntimeInfo()).toEqual({
      service: 'EventPulse Analytics API',
      nodeVersion: version,
    });
  });
});
