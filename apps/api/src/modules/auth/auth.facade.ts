import type { Prisma } from '@prisma/client';
import type {
  AuthUserProvisioner,
  AuthUserSummary,
} from '../../shared/contracts/auth-user-provisioner.js';
import type { SessionRepository } from './repositories/session.repository.js';
import type { UserRepository } from './repositories/user.repository.js';

export class AuthFacade implements AuthUserProvisioner {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async getUser(userId: string): Promise<AuthUserSummary | null> {
    const user = await this.users.findById(userId);

    if (user === null) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isActive: user.isActive,
    };
  }

  async revokeUserSessions(
    userId: string,
    organizationId: string,
    revokedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return this.sessions.revokeAllForUserInOrganization(userId, organizationId, revokedAt, tx);
  }
}
