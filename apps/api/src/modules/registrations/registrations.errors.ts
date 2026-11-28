import { AppError } from '../../errors/app-error.js';

const NOT_FOUND_DETAIL = 'The requested resource was not found.';

export function registrationNotFoundError(): AppError {
  return new AppError('Registration not found', {
    statusCode: 404,
    code: 'REGISTRATION_NOT_FOUND',
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function registrationEventRequiredError(): AppError {
  return new AppError('eventId is required for event managers', {
    statusCode: 400,
    code: 'REG_EVENT_REQUIRED',
    publicDetail: 'An eventId is required to access registrations as an event manager.',
  });
}

export function registrationInvalidTransitionError(): AppError {
  return new AppError('Invalid registration status transition', {
    statusCode: 422,
    code: 'REG_INVALID_TRANSITION',
    publicDetail: 'This status transition is not allowed for the registration.',
  });
}

export function registrationTicketMismatchError(): AppError {
  return new AppError('Ticket does not belong to the event', {
    statusCode: 422,
    code: 'REG_TICKET_EVENT_MISMATCH',
    publicDetail: 'The ticket must belong to the registration event.',
  });
}

export function registrationDeleteBlockedError(): AppError {
  return new AppError('Registration has financial or check-in history', {
    statusCode: 422,
    code: 'REG_DELETE_BLOCKED',
    publicDetail:
      'A registration with a transaction or check-in cannot be deleted; cancel it instead.',
  });
}
