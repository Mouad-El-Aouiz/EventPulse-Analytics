import type { PasswordResetToken } from '@prisma/client';
import type { MailPort } from '../../../shared/ports/mail.port.js';
import type { Clock } from '../../../shared/ports/clock.port.js';
import { resetTokenInvalidError } from '../auth.errors.js';
import type { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository.js';
import type { PrismaAuthUnitOfWork } from '../repositories/auth-unit-of-work.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { PasswordService } from './password.service.js';
import { hashTokenWithPepper } from './token-hash.js';
import type { TokenService } from './token.service.js';

export interface PasswordResetServiceOptions {
  users: UserRepository;
  resetTokens: PasswordResetTokenRepository;
  sessions: SessionRepository;
  passwords: PasswordService;
  mail: MailPort;
  unitOfWork: PrismaAuthUnitOfWork;
  tokens: TokenService;
  clock: Clock;
  resetPepper: string;
  resetTtlSeconds: number;
}

export interface ResetCompleted {
  userId: string;
  resetTokenId: string;
}

export class PasswordResetService {
  constructor(private readonly options: PasswordResetServiceOptions) {}

  async assertMailAvailable(): Promise<void> {
    await this.options.mail.assertAvailable();
  }

  async request(userId: string, email: string): Promise<void> {
    await this.options.mail.assertAvailable();

    const rawToken = this.options.tokens.generateOpaqueToken();
    const now = this.options.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.resetTtlSeconds * 1000);
    const tokenHash = hashTokenWithPepper(rawToken, this.options.resetPepper);

    await this.options.unitOfWork.run(async (tx) => {
      // Serialize reset requests per user so concurrent calls cannot leave
      // more than one active token.
      await this.options.users.lockById(userId, tx);
      await this.options.resetTokens.invalidateUnusedForUser(userId, now, tx);
      await this.options.resetTokens.create({ userId, tokenHash, expiresAt }, tx);
    });

    await this.options.mail.sendPasswordReset({ to: email, resetToken: rawToken, expiresAt });
  }

  async findValidToken(rawToken: string): Promise<PasswordResetToken | null> {
    const tokenHash = hashTokenWithPepper(rawToken, this.options.resetPepper);
    const token = await this.options.resetTokens.findByHash(tokenHash);
    const now = this.options.clock.now();

    if (token === null || token.usedAt !== null || token.expiresAt <= now) {
      return null;
    }

    return token;
  }

  async reset(rawToken: string, newPassword: string): Promise<ResetCompleted> {
    const token = await this.findValidToken(rawToken);

    if (token === null) {
      throw resetTokenInvalidError();
    }

    const passwordHash = await this.options.passwords.hash(newPassword);
    const now = this.options.clock.now();

    await this.options.unitOfWork.run(async (tx) => {
      const consumed = await this.options.resetTokens.consume(token.id, now, tx);

      if (consumed === 0) {
        throw resetTokenInvalidError();
      }

      await this.options.users.updatePassword(token.userId, passwordHash, tx);
      await this.options.sessions.revokeAllForUser(token.userId, now, tx);
      await this.options.resetTokens.invalidateUnusedForUser(token.userId, now, tx);
    });

    return { userId: token.userId, resetTokenId: token.id };
  }
}
