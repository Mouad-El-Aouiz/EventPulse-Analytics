import type { Role } from '@prisma/client';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface ActiveMembership {
  membershipId: string;
  role: Role;
  organization: OrganizationSummary;
}

export interface OrganizationsReader {
  listActiveMemberships(userId: string): Promise<ActiveMembership[]>;
  getActiveMembership(userId: string, organizationId: string): Promise<ActiveMembership | null>;
}
