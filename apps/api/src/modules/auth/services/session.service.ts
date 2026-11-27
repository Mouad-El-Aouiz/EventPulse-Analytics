import { randomUUID } from 'node:crypto';
import type { Prisma, Session } from '@prisma/client';
import type { MembershipSessionGuard } from '../../../shared/contracts/membership-session-guard.js';
import type { Clock } from '../../../shared/ports/clock.port.js';
import { noActiveMembershipError } from '../auth.errors.js';
import type { PrismaAuthUnitOfWork } from '../repositories/auth-unit-of-work.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import { hashTokenWithPepper } from './token-hash.js';
import type { TokenService } from './token.service.js';

export const MAX_ACTIVE_SESSIONS_PER_USER = 20;

export interface SessionServiceOptions {
  sessions: SessionRepository;
  memberships: MembershipSessionGuard;
  tokens: TokenService;
  unitOfWork: PrismaAuthUnitOfWork;
  clock: Clock;
  refreshPepper: string;
  slidingTtlSeconds: number;
  absoluteTtlSeconds: number;
}

export interface CreateSessionInput {
  userId: string;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RotateSessionInput {
  session: Session;
  organizationId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  session: Session;
  refreshToken: string;
}

export type RotationResult =
  | { status: 'rotated'; issued: IssuedSession }
  | { status: 'reuse'; session: Session }
  | { status: 'invalid' };

export class SessionService {
  constructor(private readonly options: SessionServiceOptions) {}

  get slidingTtlSeconds(): number {
    return this.options.slidingTtlSeconds;
  }

  get absoluteTtlSeconds(): number {
    return this.options.absoluteTtlSeconds;
  }

  private expiry(now: Date, absoluteExpiresAt: Date): Date {
    const slidingExpiry = new Date(now.getTime() + this.options.slidingTtlSeconds * 1000);

    return slidingExpiry < absoluteExpiresAt ? slidingExpiry : absoluteExpiresAt;
  }

  isExpired(session: Session, now: Date): boolean {
    return session.expiresAt <= now || session.absoluteExpiresAt <= now;
  }

  async create(input: CreateSessionInput): Promise<IssuedSession> {
    return this.options.unitOfWork.run((tx) => this.createWithinTransaction(tx, input));
  }

  /**
   * Issues a session using the caller's transaction so that invitation
   * onboarding can commit account, membership, invitation, and session together.
   */
  async createWithinTransaction(
    tx: Prisma.TransactionClient,
    input: CreateSessionInput,
  ): Promise<IssuedSession> {
    const now = this.options.clock.now();
    const refreshToken = this.options.tokens.generateOpaqueToken();
    const absoluteExpiresAt = new Date(now.getTime() + this.options.absoluteTtlSeconds * 1000);

    // Lock the membership before the session cap and session row so a
    // concurrent deactivation serializes with session issuance instead of
    // letting a stale ACTIVE snapshot create a session after revocation.
    if (
      !(await this.options.memberships.lockActiveMembership(input.userId, input.organizationId, tx))
    ) {
      throw noActiveMembershipError();
    }

    // Serialize session creation per user so the active-session cap stays
    // strict even under concurrent logins.
    await this.options.sessions.lockUser(input.userId, tx);
    await this.options.sessions.revokeExcessActiveForUser(
      input.userId,
      MAX_ACTIVE_SESSIONS_PER_USER - 1,
      now,
      tx,
    );

    const session = await this.options.sessions.create(
      {
        userId: input.userId,
        organizationId: input.organizationId,
        familyId: randomUUID(),
        refreshTokenHash: hashTokenWithPepper(refreshToken, this.options.refreshPepper),
        expiresAt: this.expiry(now, absoluteExpiresAt),
        absoluteExpiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
      tx,
    );

    return { session, refreshToken };
  }

  async rotate(input: RotateSessionInput): Promise<RotationResult> {
    const now = this.options.clock.now();
    const refreshToken = this.options.tokens.generateOpaqueToken();
    const refreshTokenHash = hashTokenWithPepper(refreshToken, this.options.refreshPepper);

    const session = await this.options.unitOfWork.run(async (tx) => {
      // Deactivation locks the membership row before revoking sessions; taking
      // the same lock here prevents a refresh from racing past deactivation.
      if (
        !(await this.options.memberships.lockActiveMembership(
          input.session.userId,
          input.organizationId,
          tx,
        ))
      ) {
        throw noActiveMembershipError();
      }

      const claimed = await this.options.sessions.claimRotation(
        input.session.id,
        input.session.refreshTokenHash,
        now,
        tx,
      );

      if (claimed === 0) {
        return null;
      }

      const created = await this.options.sessions.create(
        {
          userId: input.session.userId,
          organizationId: input.organizationId,
          familyId: input.session.familyId,
          refreshTokenHash,
          expiresAt: this.expiry(now, input.session.absoluteExpiresAt),
          absoluteExpiresAt: input.session.absoluteExpiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        tx,
      );

      await this.options.sessions.setReplacement(input.session.id, created.id, tx);

      return created;
    });

    if (session === null) {
      const current = await this.options.sessions.findById(input.session.id);

      if (current !== null && current.revokedAt !== null) {
        return { status: 'reuse', session: current };
      }

      return { status: 'invalid' };
    }

    return { status: 'rotated', issued: { session, refreshToken } };
  }
}
