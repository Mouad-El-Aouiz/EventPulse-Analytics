import { AppError } from '../../errors/app-error.js';

export const AUDIT_LOG_NOT_FOUND = 'AUDIT_LOG_NOT_FOUND';

export function auditLogNotFoundError(): AppError {
  return new AppError('Audit log not found', {
    statusCode: 404,
    code: AUDIT_LOG_NOT_FOUND,
    publicDetail: 'The requested resource was not found.',
  });
}
