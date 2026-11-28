import type { Logger } from 'pino';
import { sanitizedErrorFields } from '../../errors/error-logging.js';
import type { AuditEvent, AuditPort } from '../ports/audit.port.js';

export async function recordAuditBestEffort(
  audit: AuditPort,
  logger: Logger,
  event: AuditEvent,
): Promise<void> {
  try {
    await audit.record(event);
  } catch (error) {
    logger.error(
      { ...sanitizedErrorFields(error), actionType: event.actionType },
      'Failed to record audit event',
    );
  }
}
