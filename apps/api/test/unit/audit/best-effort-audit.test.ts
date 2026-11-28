import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/errors/app-error.js';
import { recordAuditBestEffort } from '../../../src/shared/audit/best-effort-audit.js';
import type { AuditEvent, AuditPort } from '../../../src/shared/ports/audit.port.js';

const EVENT: AuditEvent = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '22222222-2222-4222-8222-222222222222',
  category: 'AUTH',
  actionType: 'AUTH_LOGIN_SUCCEEDED',
  resourceType: 'session',
  resourceId: '33333333-3333-4333-8333-333333333333',
  result: 'SUCCESS',
  metadata: { reason: 'VALID_CREDENTIALS' },
  ipAddress: '127.0.0.1',
  userAgent: 'vitest',
};

function createAudit(record: AuditPort['record']): AuditPort {
  return { record };
}

function captureLogger() {
  const lines: string[] = [];
  const logger = pino(
    { level: 'error' },
    {
      write(line: string) {
        lines.push(line);
      },
    },
  );

  return { logger, lines };
}

describe('recordAuditBestEffort', () => {
  it('records the event when the writer succeeds', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const { logger, lines } = captureLogger();

    await recordAuditBestEffort(createAudit(record), logger, EVENT);

    expect(record).toHaveBeenCalledWith(EVENT);
    expect(lines).toHaveLength(0);
  });

  it('swallows writer failures and logs only sanitized fields', async () => {
    const failure = new AppError('postgresql://eventpulse:supersecret@db/audit', {
      statusCode: 503,
      code: 'AUDIT_WRITE_FAILED',
    });
    const record = vi.fn().mockRejectedValue(failure);
    const { logger, lines } = captureLogger();

    await expect(
      recordAuditBestEffort(createAudit(record), logger, EVENT),
    ).resolves.toBeUndefined();

    expect(lines).toHaveLength(1);
    const line = lines[0] ?? '';

    expect(JSON.parse(line)).toMatchObject({
      actionType: EVENT.actionType,
      errorName: 'AppError',
      errorCode: 'AUDIT_WRITE_FAILED',
      statusCode: 503,
      msg: 'Failed to record audit event',
    });
    expect(line).not.toContain('supersecret');
    expect(line).not.toContain('postgresql://');
    expect(line).not.toContain('errorMessage');
  });
});
