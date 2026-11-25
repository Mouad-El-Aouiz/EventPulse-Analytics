import type { Role } from '@prisma/client';

export interface AuthContext {
  userId: string;
  sessionId: string;
  organizationId: string;
  roleHint: Role;
  tokenId: string;
}

export interface ActorContext extends AuthContext {
  membershipId: string;
  role: Role;
}
