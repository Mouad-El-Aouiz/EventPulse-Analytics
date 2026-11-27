import type { Prisma, User } from '@prisma/client';
import type {
  InvitationAccountGateway,
  InvitationAccountUser,
  IssueInvitationSessionInput,
  IssuedInvitationSession,
  ProvisionedInvitationUser,
  ProvisionInvitationUserInput,
} from '../../shared/contracts/invitation-account-gateway.js';
import type { Clock } from '../../shared/ports/clock.port.js';
import type { UserRepository } from './repositories/user.repository.js';
import type { PasswordService } from './services/password.service.js';
import type { SessionService } from './services/session.service.js';
import type { TokenService } from './services/token.service.js';

export interface AuthInvitationAccountGatewayOptions {
  users: UserRepository;
  passwords: PasswordService;
  sessions: SessionService;
  tokens: TokenService;
  clock: Clock;
}

function toAccountUser(user: User): InvitationAccountUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
  };
}

export class AuthInvitationAccountGateway implements InvitationAccountGateway {
  constructor(private readonly options: AuthInvitationAccountGatewayOptions) {}

  hashPassword(password: string): Promise<string> {
    return this.options.passwords.hash(password);
  }

  async findUserByEmail(
    email: string,
    tx: Prisma.TransactionClient,
  ): Promise<InvitationAccountUser | null> {
    const user = await this.options.users.findByEmail(email, tx);

    return user === null ? null : toAccountUser(user);
  }

  async provisionUser(
    input: ProvisionInvitationUserInput,
    tx: Prisma.TransactionClient,
  ): Promise<ProvisionedInvitationUser> {
    // INSERT ... ON CONFLICT makes concurrent first-time acceptance for the
    // same email converge on a single account without touching an existing
    // password hash.
    const inserted = await tx.$executeRaw`
      INSERT INTO "users" ("email", "password_hash", "display_name", "updated_at")
      VALUES (${input.email}, ${input.passwordHash}, ${input.displayName}, CURRENT_TIMESTAMP)
      ON CONFLICT ("email") DO NOTHING
    `;

    const user = await tx.user.findUniqueOrThrow({ where: { email: input.email } });

    return { user: toAccountUser(user), created: inserted === 1 };
  }

  async issueSession(
    input: IssueInvitationSessionInput,
    tx: Prisma.TransactionClient,
  ): Promise<IssuedInvitationSession> {
    const issued = await this.options.sessions.createWithinTransaction(tx, {
      userId: input.user.id,
      organizationId: input.organization.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    const accessToken = await this.options.tokens.signAccessToken({
      userId: input.user.id,
      sessionId: issued.session.id,
      organizationId: input.organization.id,
      role: input.role,
    });

    return {
      body: {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.options.tokens.accessTtlSeconds,
        user: {
          id: input.user.id,
          email: input.user.email,
          displayName: input.user.displayName,
        },
        activeOrganization: {
          id: input.organization.id,
          name: input.organization.name,
          slug: input.organization.slug,
          role: input.role,
        },
      },
      refreshToken: issued.refreshToken,
      refreshMaxAgeSeconds: this.options.sessions.slidingTtlSeconds,
    };
  }

  async updateLastLogin(userId: string, at: Date, tx: Prisma.TransactionClient): Promise<void> {
    await this.options.users.updateLastLogin(userId, at, tx);
  }
}
