import { AppError } from '../../errors/app-error.js';

export const AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS';
export const AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING';
export const AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID';
export const AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED';
export const AUTH_SESSION_REVOKED = 'AUTH_SESSION_REVOKED';
export const AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED';
export const AUTH_SESSION_NOT_FOUND = 'AUTH_SESSION_NOT_FOUND';
export const AUTH_NO_ACTIVE_MEMBERSHIP = 'AUTH_NO_ACTIVE_MEMBERSHIP';
export const AUTH_ORGANIZATION_REQUIRED = 'AUTH_ORGANIZATION_REQUIRED';
export const AUTH_RESET_TOKEN_INVALID = 'AUTH_RESET_TOKEN_INVALID';
export const AUTH_ACCOUNT_DISABLED = 'AUTH_ACCOUNT_DISABLED';

const INVALID_CREDENTIALS_DETAIL = 'Invalid email or password.';
const INVALID_TOKEN_DETAIL = 'The authentication token is invalid.';
const SESSION_INVALID_DETAIL = 'The session is no longer valid.';

export function invalidCredentialsError(): AppError {
  return new AppError('Invalid credentials', {
    statusCode: 401,
    code: AUTH_INVALID_CREDENTIALS,
    publicDetail: INVALID_CREDENTIALS_DETAIL,
  });
}

export function tokenMissingError(): AppError {
  return new AppError('Authentication token missing', {
    statusCode: 401,
    code: AUTH_TOKEN_MISSING,
    publicDetail: 'Authentication is required.',
  });
}

export function tokenInvalidError(cause?: unknown): AppError {
  return new AppError('Authentication token invalid', {
    statusCode: 401,
    code: AUTH_TOKEN_INVALID,
    publicDetail: INVALID_TOKEN_DETAIL,
    cause,
  });
}

export function tokenExpiredError(cause?: unknown): AppError {
  return new AppError('Authentication token expired', {
    statusCode: 401,
    code: AUTH_TOKEN_EXPIRED,
    publicDetail: INVALID_TOKEN_DETAIL,
    cause,
  });
}

export function sessionRevokedError(): AppError {
  return new AppError('Session revoked', {
    statusCode: 401,
    code: AUTH_SESSION_REVOKED,
    publicDetail: SESSION_INVALID_DETAIL,
  });
}

export function sessionExpiredError(): AppError {
  return new AppError('Session expired', {
    statusCode: 401,
    code: AUTH_SESSION_EXPIRED,
    publicDetail: SESSION_INVALID_DETAIL,
  });
}

export function sessionNotFoundError(): AppError {
  return new AppError('Session not found', {
    statusCode: 404,
    code: AUTH_SESSION_NOT_FOUND,
    publicDetail: 'The requested resource was not found.',
  });
}

export function accountDisabledError(): AppError {
  return new AppError('Account disabled', {
    statusCode: 403,
    code: AUTH_ACCOUNT_DISABLED,
    publicDetail: 'This account is disabled.',
  });
}

export function noActiveMembershipError(): AppError {
  return new AppError('No active membership', {
    statusCode: 403,
    code: AUTH_NO_ACTIVE_MEMBERSHIP,
    publicDetail: 'No active organization membership is available.',
  });
}

export function organizationRequiredError(): AppError {
  return new AppError('Organization selection required', {
    statusCode: 409,
    code: AUTH_ORGANIZATION_REQUIRED,
    publicDetail: 'An organization must be selected.',
  });
}

export { AUTH_ORIGIN_FORBIDDEN, originForbiddenError } from '../../shared/http/origin.js';

export function resetTokenInvalidError(): AppError {
  return new AppError('Password reset token invalid', {
    statusCode: 400,
    code: AUTH_RESET_TOKEN_INVALID,
    publicDetail: 'The password-reset token is invalid or expired.',
  });
}

export { AUTH_FORBIDDEN, forbiddenError } from '../../shared/http/authorization.js';
