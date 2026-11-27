import type { Prisma, Role } from '@prisma/client';

export interface InvitationAccountUser {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
}

export interface InvitationOrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface ProvisionInvitationUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface ProvisionedInvitationUser {
  user: InvitationAccountUser;
  created: boolean;
}

export interface IssueInvitationSessionInput {
  user: InvitationAccountUser;
  organization: InvitationOrganizationSummary;
  role: Role;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface InvitationSessionResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: { id: string; email: string; displayName: string };
  activeOrganization: {
    id: string;
    name: string;
    slug: string;
    role: Role;
  };
}

export interface IssuedInvitationSession {
  body: InvitationSessionResponse;
  refreshToken: string;
  refreshMaxAgeSeconds: number;
}

/**
 * Auth-owned operations required to onboard an invited user atomically.
 * Implementations must honor the supplied transaction so that account
 * creation, membership creation, invitation consumption, and session
 * issuance commit or roll back together.
 */
export interface InvitationAccountGateway {
  hashPassword(password: string): Promise<string>;
  findUserByEmail(
    email: string,
    tx: Prisma.TransactionClient,
  ): Promise<InvitationAccountUser | null>;
  provisionUser(
    input: ProvisionInvitationUserInput,
    tx: Prisma.TransactionClient,
  ): Promise<ProvisionedInvitationUser>;
  issueSession(
    input: IssueInvitationSessionInput,
    tx: Prisma.TransactionClient,
  ): Promise<IssuedInvitationSession>;
  updateLastLogin(userId: string, at: Date, tx: Prisma.TransactionClient): Promise<void>;
}
