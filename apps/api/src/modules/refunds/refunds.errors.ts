import { AppError } from '../../errors/app-error.js';

export function refundNotFoundError(): AppError {
  return new AppError('Refund not found', {
    statusCode: 404,
    code: 'REFUND_NOT_FOUND',
    publicDetail: 'The requested resource was not found.',
  });
}

export function refundEventRequiredError(): AppError {
  return new AppError('eventId is required for event managers', {
    statusCode: 400,
    code: 'REFUND_EVENT_REQUIRED',
    publicDetail: 'An eventId is required to access refunds as an event manager.',
  });
}
