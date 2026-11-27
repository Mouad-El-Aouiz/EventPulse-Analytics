import type { Role } from '@prisma/client';
import type {
  ActiveMembership,
  OrganizationSummary,
  OrganizationsReader,
} from './organizations-reader.js';

export interface OrganizationSettings extends OrganizationSummary {
  timezone: string;
  currency: string;
  exportRetentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserOrganization extends OrganizationSummary {
  membershipId: string;
  role: Role;
}

export interface OrganizationsFacade extends OrganizationsReader {
  listUserOrganizations(userId: string): Promise<UserOrganization[]>;
  getSettings(organizationId: string): Promise<OrganizationSettings | null>;
  assertRole(
    userId: string,
    organizationId: string,
    allowedRoles: readonly Role[],
  ): Promise<ActiveMembership>;
}
