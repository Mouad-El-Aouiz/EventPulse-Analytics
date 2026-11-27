import type { InvitationStatus, MembershipStatus, Role } from '@prisma/client';

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  exportRetentionDays: number;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface MembershipView {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  status: MembershipStatus;
  joinedAt: Date;
  disabledAt: Date | null;
}

export interface InvitationView {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  invitedByUserId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: 'ACTIVE' | 'REVOKED';
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedApiKeyView extends ApiKeyView {
  secret: string;
}

export interface RotatedApiKeyView extends CreatedApiKeyView {
  replacedKeyId: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  timezone?: string;
  currency?: 'EUR';
  exportRetentionDays?: number;
}

export interface UpdateMembershipInput {
  role?: Role;
  status?: MembershipStatus;
}

export interface CreateInvitationInput {
  email: string;
  role: Role;
}

export interface AcceptInvitationWithTokenInput {
  token: string;
  password: string;
  displayName?: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: Date;
}

export interface RotateApiKeyInput {
  name?: string;
  expiresAt?: Date;
}
