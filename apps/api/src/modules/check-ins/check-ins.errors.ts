import { AppError } from '../../errors/app-error.js';

export function checkInNotFoundError(): AppError {
  return new AppError('Check-in not found', {
    statusCode: 404,
    code: 'CHECK_IN_NOT_FOUND',
    publicDetail: 'The requested resource was not found.',
  });
}

export function checkInEventRequiredError(): AppError {
  return new AppError('eventId is required for event managers', {
    statusCode: 400,
    code: 'CHK_EVENT_REQUIRED',
    publicDetail: 'An eventId is required to access check-ins as an event manager.',
  });
}

export function checkInDuplicateError(): AppError {
  return new AppError('Participant already has a valid check-in', {
    statusCode: 409,
    code: 'CHK_DUPLICATE',
    publicDetail: 'This participant already has a valid check-in for the event.',
  });
}
