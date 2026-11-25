import type { Role } from '@prisma/client';

export interface AuthUserView {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthOrganizationView {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUserView;
  activeOrganization: AuthOrganizationView;
}

export interface MeResponse {
  user: AuthUserView;
  activeOrganization: AuthOrganizationView;
  organizations: AuthOrganizationView[];
}

export interface SessionView {
  id: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthResult {
  body: AuthResponse;
  refreshToken: string;
  refreshMaxAgeSeconds: number;
}

export interface LogoutResult {
  revokedCurrentSession: boolean;
}
