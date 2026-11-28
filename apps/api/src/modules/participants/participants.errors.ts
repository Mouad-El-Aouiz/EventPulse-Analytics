import { AppError } from '../../errors/app-error.js';

const NOT_FOUND_DETAIL = 'The requested resource was not found.';

export function participantNotFoundError(): AppError {
  return new AppError('Participant not found', {
    statusCode: 404,
    code: 'PARTICIPANT_NOT_FOUND',
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function participantEventRequiredError(): AppError {
  return new AppError('eventId is required for event managers', {
    statusCode: 400,
    code: 'PARTICIPANT_EVENT_REQUIRED',
    publicDetail: 'An eventId is required to access participant data as an event manager.',
  });
}

export function participantMergeInvalidError(reason: string): AppError {
  return new AppError(`Participant merge rejected: ${reason}`, {
    statusCode: 422,
    code: 'PARTICIPANT_MERGE_INVALID',
    publicDetail: 'The participants cannot be merged.',
  });
}

export function participantMergeBlockedError(): AppError {
  return new AppError('Participant merge blocked by immutable check-in history', {
    statusCode: 409,
    code: 'PARTICIPANT_MERGE_BLOCKED',
    publicDetail: 'A participant with immutable check-in history cannot be merged.',
  });
}

export function participantErasureBlockedError(): AppError {
  return new AppError('Participant erasure blocked by financial references', {
    statusCode: 409,
    code: 'PARTICIPANT_ERASURE_BLOCKED',
    publicDetail: 'The participant is referenced by a transaction or refund and cannot be erased.',
  });
}
