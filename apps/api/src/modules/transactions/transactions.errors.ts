import { AppError } from '../../errors/app-error.js';

const NOT_FOUND_DETAIL = 'The requested resource was not found.';

export function transactionNotFoundError(): AppError {
  return new AppError('Transaction not found', {
    statusCode: 404,
    code: 'TRANSACTION_NOT_FOUND',
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function transactionEventRequiredError(): AppError {
  return new AppError('eventId is required for event managers', {
    statusCode: 400,
    code: 'TXN_EVENT_REQUIRED',
    publicDetail: 'An eventId is required to access transactions as an event manager.',
  });
}

export function transactionInvalidTransitionError(): AppError {
  return new AppError('Invalid transaction status transition', {
    statusCode: 422,
    code: 'PAY_INVALID_TRANSITION',
    publicDetail: 'This transaction status transition is not allowed.',
  });
}

export function transactionReferenceError(): AppError {
  return new AppError('Invalid transaction reference', {
    statusCode: 422,
    code: 'PAY_REFERENCE_INVALID',
    publicDetail:
      'A TICKET transaction requires a registration of the same event and a BOOTH transaction requires a booth reservation of the same event.',
  });
}

export function transactionDuplicateError(): AppError {
  return new AppError('A transaction already exists for this reference', {
    statusCode: 409,
    code: 'PAY_DUPLICATE_TRANSACTION',
    publicDetail: 'A transaction already exists for this registration or booth reservation.',
  });
}

export function refundNotAllowedError(): AppError {
  return new AppError('Transaction is not refundable', {
    statusCode: 422,
    code: 'PAY_REFUND_NOT_ALLOWED',
    publicDetail: 'Only PAID or PARTIALLY_REFUNDED transactions can be refunded.',
  });
}

export function refundExceedsAmountError(): AppError {
  return new AppError('Refund exceeds the paid amount', {
    statusCode: 422,
    code: 'PAY_REFUND_EXCEEDS_AMOUNT',
    publicDetail: 'The cumulative refunds cannot exceed the paid transaction amount.',
  });
}
