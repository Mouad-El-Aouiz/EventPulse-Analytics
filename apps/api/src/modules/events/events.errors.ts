import { AppError } from '../../errors/app-error.js';

const NOT_FOUND_DETAIL = 'The requested resource was not found.';

export function eventNotFoundError(): AppError {
  return new AppError('Event not found', {
    statusCode: 404,
    code: 'EVENT_NOT_FOUND',
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function eventInvalidTransitionError(): AppError {
  return new AppError('Invalid event status transition', {
    statusCode: 422,
    code: 'EVT_INVALID_TRANSITION',
    publicDetail: 'This status transition is not allowed for the event.',
  });
}

export function eventFieldsFrozenError(): AppError {
  return new AppError('Event scheduling fields are frozen', {
    statusCode: 422,
    code: 'EVT_FIELDS_FROZEN',
    publicDetail: 'Dates, timezone and check-in window cannot change after the event starts.',
  });
}

export function eventTypeFrozenError(): AppError {
  return new AppError('Event type is frozen', {
    statusCode: 422,
    code: 'EVT_TYPE_FROZEN',
    publicDetail: 'The event type cannot change after the event starts.',
  });
}

export function eventDeleteNotAllowedError(): AppError {
  return new AppError('Event cannot be deleted in its current status', {
    statusCode: 422,
    code: 'EVT_DELETE_NOT_ALLOWED',
    publicDetail: 'Only a draft or cancelled event can be deleted.',
  });
}

export function eventHasRegistrationsError(): AppError {
  return new AppError('Event has registrations', {
    statusCode: 409,
    code: 'EVT_HAS_REGISTRATIONS',
    publicDetail: 'An event with registrations cannot be deleted.',
  });
}

export function eventManagerInvalidError(): AppError {
  return new AppError('Invalid event manager', {
    statusCode: 422,
    code: 'EVT_MANAGER_INVALID',
    publicDetail: 'The manager must be an active EVENT_MANAGER membership of this organization.',
  });
}

export function eventDatesInvalidError(): AppError {
  return new AppError('Invalid event dates', {
    statusCode: 422,
    code: 'EVT_DATES_INVALID',
    publicDetail: 'The event must end after it starts and the check-in window must be ordered.',
  });
}

export function ticketNotFoundError(): AppError {
  return new AppError('Ticket not found', {
    statusCode: 404,
    code: 'TICKET_NOT_FOUND',
    publicDetail: NOT_FOUND_DETAIL,
  });
}

export function ticketInUseError(): AppError {
  return new AppError('Ticket is referenced by a registration', {
    statusCode: 409,
    code: 'TICKET_IN_USE',
    publicDetail: 'A ticket referenced by a registration cannot be deleted.',
  });
}
