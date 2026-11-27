import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireRole } from '../../src/shared/http/authorization.js';

function run(role: 'OWNER' | 'ADMIN' | 'VIEWER' | undefined) {
  const req = { actor: role === undefined ? undefined : { role } } as unknown as Request;
  const next = vi.fn();

  requireRole('OWNER', 'ADMIN')(req, {} as Response, next);

  return next;
}

describe('requireRole', () => {
  it('allows an allowed role', () => {
    const next = run('ADMIN');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a role outside the allow-list', () => {
    const next = run('VIEWER');
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'AUTH_FORBIDDEN' }),
    );
  });

  it('rejects a missing actor', () => {
    const next = run(undefined);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
