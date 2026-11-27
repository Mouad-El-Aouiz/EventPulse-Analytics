import { describe, expect, it, vi } from 'vitest';
import { PrismaOrganizationsFacade } from '../../../src/modules/organizations/organizations-reader.js';

function createClient(membership: unknown) {
  return {
    membership: { findFirst: vi.fn().mockResolvedValue(membership) },
  };
}

describe('PrismaOrganizationsFacade.assertRole', () => {
  it('returns the active membership for an allowed role', async () => {
    const client = createClient({
      id: 'membership-1',
      role: 'ADMIN',
      organization: { id: 'org-1', name: 'Acme', slug: 'acme' },
    });
    const facade = new PrismaOrganizationsFacade(client as never);

    await expect(facade.assertRole('user-1', 'org-1', ['OWNER', 'ADMIN'])).resolves.toMatchObject({
      membershipId: 'membership-1',
      role: 'ADMIN',
    });
  });

  it('throws 403 for a disallowed role', async () => {
    const client = createClient({
      id: 'membership-1',
      role: 'VIEWER',
      organization: { id: 'org-1', name: 'Acme', slug: 'acme' },
    });
    const facade = new PrismaOrganizationsFacade(client as never);

    await expect(facade.assertRole('user-1', 'org-1', ['OWNER'])).rejects.toMatchObject({
      statusCode: 403,
      code: 'AUTH_FORBIDDEN',
    });
  });

  it('throws 403 when no active membership exists', async () => {
    const facade = new PrismaOrganizationsFacade(createClient(null) as never);

    await expect(facade.assertRole('user-1', 'org-1', ['OWNER'])).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
