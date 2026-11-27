import type { Prisma } from '@prisma/client';

/**
 * Locks the user's membership row and reports whether it is still ACTIVE.
 * Session creation and rotation use this guard inside their transaction so a
 * concurrent deactivation cannot be bypassed by a stale membership snapshot.
 */
export interface MembershipSessionGuard {
  lockActiveMembership(
    userId: string,
    organizationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<boolean>;
}
