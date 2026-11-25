import type { RequestHandler } from 'express';
import type { OrganizationsReader } from '../../../shared/contracts/organizations-reader.js';
import { noActiveMembershipError, tokenMissingError } from '../auth.errors.js';

export function createTenantContextMiddleware(organizations: OrganizationsReader): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (req.auth === undefined) {
        throw tokenMissingError();
      }

      const membership = await organizations.getActiveMembership(
        req.auth.userId,
        req.auth.organizationId,
      );

      if (membership === null) {
        throw noActiveMembershipError();
      }

      req.actor = {
        ...req.auth,
        membershipId: membership.membershipId,
        role: membership.role,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
