import { AppError } from '../../errors/app-error.js';

const CURSOR_INVALID = 'CURSOR_INVALID';
const CURSOR_MAX_LENGTH = 512;
const CURSOR_MAX_VALUE_LENGTH = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CursorPayload {
  value: string;
  id: string;
}

export function cursorInvalidError(): AppError {
  return new AppError('Invalid pagination cursor', {
    statusCode: 400,
    code: CURSOR_INVALID,
    publicDetail: 'The pagination cursor is invalid.',
  });
}

export function encodeCursor(value: string | number | Date, id: string): string {
  const serialized = value instanceof Date ? value.toISOString() : String(value);

  return Buffer.from(JSON.stringify({ v: serialized, id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  if (cursor.length === 0 || cursor.length > CURSOR_MAX_LENGTH) {
    throw cursorInvalidError();
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw cursorInvalidError();
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw cursorInvalidError();
  }

  const record = parsed as { v?: unknown; id?: unknown };

  if (
    typeof record.v !== 'string' ||
    record.v.length === 0 ||
    record.v.length > CURSOR_MAX_VALUE_LENGTH ||
    typeof record.id !== 'string' ||
    !UUID_PATTERN.test(record.id)
  ) {
    throw cursorInvalidError();
  }

  return { value: record.v, id: record.id };
}
