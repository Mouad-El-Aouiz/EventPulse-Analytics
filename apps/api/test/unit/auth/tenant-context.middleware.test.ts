import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createTenantContextMiddleware } from '../../../src/modules/auth/middleware/tenant-context.middleware.js';
import type { OrganizationsReader } from '../../../src/shared/contracts/organizations-reader.js';
import type { AuthContext } from '../../../src/shared/types/actor-context.js';

const AUTH: AuthContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  roleHint: 'ANALYST',
  tokenId: '44444444-4444-4444-8444-444444444444',
};

function dependenciesWith(
  getActiveMembership: OrganizationsReader['getActiveMembership'],
): OrganizationsReader {
  return { getActiveMembership } as unknown as OrganizationsReader;
}

const ORGANIZATION = {
  id: AUTH.organizationId,
  name: 'Test Organization',
  slug: 'test-organization',
};

describe('tenant context middleware', () => {
  it('rejects a request without an authenticated context', async () => {
    const getActiveMembership = vi.fn();
    const middleware = createTenantContextMiddleware(
      dependenciesWith(getActiveMembership as OrganizationsReader['getActiveMembership']),
    );
    const next = vi.fn();

    await middleware({ get: vi.fn() } as unknown as Request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'AUTH_TOKEN_MISSING' }),
    );
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it('rejects a user without an active membership', async () => {
    const middleware = createTenantContextMiddleware(dependenciesWith(async () => null));
    const request = { auth: AUTH } as unknown as Request;
    const next = vi.fn();

    await middleware(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: 'AUTH_NO_ACTIVE_MEMBERSHIP' }),
    );
    expect(request.actor).toBeUndefined();
  });

  it('derives the actor role and membership from the database, not the token hint', async () => {
    const getActiveMembership = vi.fn(async () => ({
      membershipId: '55555555-5555-4555-8555-555555555555',
      role: 'VIEWER' as const,
      organization: ORGANIZATION,
    }));
    const middleware = createTenantContextMiddleware(dependenciesWith(getActiveMembership));
    const request = { auth: AUTH } as unknown as Request;
    const next = vi.fn();

    await middleware(request, {} as Response, next);

    expect(getActiveMembership).toHaveBeenCalledWith(AUTH.userId, AUTH.organizationId);
    expect(next).toHaveBeenCalledWith();
    expect(request.actor).toEqual({
      ...AUTH,
      role: 'VIEWER',
      membershipId: '55555555-5555-4555-8555-555555555555',
    });
  });
});
