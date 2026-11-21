import { describe, expect, it, vi } from 'vitest';

describe('server module import', () => {
  it('does not start a server or register signal handlers on import', async () => {
    const sigtermListeners = process.listenerCount('SIGTERM');
    const sigintListeners = process.listenerCount('SIGINT');
    const exitCode = process.exitCode;

    vi.resetModules();
    await import('../../src/server.js');

    expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners);
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners);
    expect(process.exitCode).toBe(exitCode);
  });
});
