import type { Session, User } from '@prisma/client';
import type { ActiveMembership } from '../../shared/contracts/organizations-reader.js';
import type { AuthOrganizationView, AuthUserView, SessionView } from './auth.types.js';

export function toAuthUserView(user: User): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

export function toAuthOrganizationView(membership: ActiveMembership): AuthOrganizationView {
  return {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
  };
}

export function toSessionView(session: Session, currentSessionId: string): SessionView {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    current: session.id === currentSessionId,
  };
}
