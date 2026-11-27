import { AppError } from '../../errors/app-error.js';

export const ORGANIZATION_NOT_FOUND = 'ORGANIZATION_NOT_FOUND';
export const ORGANIZATION_SLUG_TAKEN = 'ORGANIZATION_SLUG_TAKEN';
export const MEMBERSHIP_NOT_FOUND = 'MEMBERSHIP_NOT_FOUND';
export const MEMBERSHIP_ALREADY_EXISTS = 'MEMBERSHIP_ALREADY_EXISTS';
export const LAST_OWNER_PROTECTED = 'LAST_OWNER_PROTECTED';
export const INVITATION_NOT_FOUND = 'INVITATION_NOT_FOUND';
export const INVITATION_INVALID = 'INVITATION_INVALID';
export const INVITATION_EMAIL_MISMATCH = 'INVITATION_EMAIL_MISMATCH';
export const INVITATION_ALREADY_PENDING = 'INVITATION_ALREADY_PENDING';
export const INVITATION_NOT_PENDING = 'INVITATION_NOT_PENDING';
export const INVITATION_DELIVERY_FAILED = 'INVITATION_DELIVERY_FAILED';
export const API_KEY_NOT_FOUND = 'API_KEY_NOT_FOUND';
export const API_KEY_SCOPES_INVALID = 'API_KEY_SCOPES_INVALID';
export const API_KEY_EXPIRY_INVALID = 'API_KEY_EXPIRY_INVALID';
export const API_KEY_NOT_ACTIVE = 'API_KEY_NOT_ACTIVE';

const NOT_FOUND_DETAIL = 'The requested resource was not found.';

export function organizationNotFoundError(): AppError {
  return new AppError('Organization not found', {
    statusCode: 404,
    code: ORGANIZATION_NOT_FOUND,
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function organizationSlugTakenError(): AppError {
  return new AppError('Organization slug already used', {
    statusCode: 409,
    code: ORGANIZATION_SLUG_TAKEN,
    publicDetail: 'This organization slug is already in use.',
  });
}

export function membershipNotFoundError(): AppError {
  return new AppError('Membership not found', {
    statusCode: 404,
    code: MEMBERSHIP_NOT_FOUND,
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function membershipAlreadyExistsError(): AppError {
  return new AppError('Membership already exists', {
    statusCode: 409,
    code: MEMBERSHIP_ALREADY_EXISTS,
    publicDetail: 'This user is already a member of the organization.',
  });
}

export function lastOwnerProtectedError(): AppError {
  return new AppError('Last owner protected', {
    statusCode: 409,
    code: LAST_OWNER_PROTECTED,
    publicDetail: 'The organization must retain at least one active owner.',
  });
}

export function invitationNotFoundError(): AppError {
  return new AppError('Invitation not found', {
    statusCode: 404,
    code: INVITATION_NOT_FOUND,
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function invitationInvalidError(): AppError {
  return new AppError('Invitation invalid', {
    statusCode: 400,
    code: INVITATION_INVALID,
    publicDetail: 'The invitation is invalid, expired, or no longer pending.',
  });
}

export function invitationEmailMismatchError(): AppError {
  return new AppError('Invitation email mismatch', {
    statusCode: 403,
    code: INVITATION_EMAIL_MISMATCH,
    publicDetail: 'This invitation was issued for a different email address.',
  });
}

export function invitationAlreadyPendingError(): AppError {
  return new AppError('Invitation already pending', {
    statusCode: 409,
    code: INVITATION_ALREADY_PENDING,
    publicDetail: 'A pending invitation already exists for this email address.',
  });
}

export function invitationNotPendingError(): AppError {
  return new AppError('Invitation not pending', {
    statusCode: 409,
    code: INVITATION_NOT_PENDING,
    publicDetail: 'Only a pending invitation can be revoked.',
  });
}

export function invitationDeliveryFailedError(cause?: unknown): AppError {
  return new AppError('Invitation delivery failed', {
    statusCode: 503,
    code: INVITATION_DELIVERY_FAILED,
    publicDetail: 'The invitation email could not be delivered. Please try again.',
    cause,
  });
}

export function apiKeyNotFoundError(): AppError {
  return new AppError('API key not found', {
    statusCode: 404,
    code: API_KEY_NOT_FOUND,
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function apiKeyScopesInvalidError(): AppError {
  return new AppError('Invalid API key scopes', {
    statusCode: 400,
    code: API_KEY_SCOPES_INVALID,
    publicDetail: 'Scopes must be unique and limited to ingestion:write.',
  });
}

export function apiKeyExpiryInvalidError(): AppError {
  return new AppError('Invalid API key expiry', {
    statusCode: 400,
    code: API_KEY_EXPIRY_INVALID,
    publicDetail: 'The expiry must be a valid future date.',
  });
}

export function apiKeyNotActiveError(): AppError {
  return new AppError('API key is not active', {
    statusCode: 409,
    code: API_KEY_NOT_ACTIVE,
    publicDetail: 'Only an active API key can be rotated.',
  });
}
