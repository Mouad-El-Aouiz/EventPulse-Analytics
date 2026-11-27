import type { Role } from '@prisma/client';

export interface PasswordResetMail {
  to: string;
  resetToken: string;
  expiresAt: Date;
}

export interface OrganizationInvitationMail {
  to: string;
  organizationName: string;
  inviterName: string;
  role: Role;
  invitationToken: string;
  expiresAt: Date;
}

export interface MailPort {
  assertAvailable(): Promise<void>;
  sendPasswordReset(input: PasswordResetMail): Promise<void>;
  sendOrganizationInvitation(input: OrganizationInvitationMail): Promise<void>;
}
