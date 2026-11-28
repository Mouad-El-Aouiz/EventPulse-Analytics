import { describe, expect, it } from 'vitest';
import { cursorInvalidError, decodeCursor, encodeCursor } from '../../../src/shared/http/cursor.js';

const ID = '11111111-1111-4111-8111-111111111111';

function expectCursorError(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ code: 'CURSOR_INVALID', statusCode: 400 });
    return;
  }

  throw new Error('Expected cursorInvalidError to be thrown');
}

describe('cursor codec', () => {
  it('round-trips string, number and Date values with the identifier', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const fromDate = decodeCursor(encodeCursor(date, ID));
    const fromNumber = decodeCursor(encodeCursor(42, ID));

    expect(fromDate).toEqual({ value: date.toISOString(), id: ID });
    expect(fromNumber).toEqual({ value: '42', id: ID });
  });

  it('rejects empty, oversized and non-base64url payloads', () => {
    expectCursorError(() => decodeCursor(''));
    expectCursorError(() => decodeCursor('x'.repeat(513)));
    expectCursorError(() => decodeCursor('!!!not-base64!!!'));
  });

  it('rejects JSON that is not an object with a valid value and UUID', () => {
    expectCursorError(() => decodeCursor(Buffer.from('null').toString('base64url')));
    expectCursorError(() => decodeCursor(Buffer.from('"text"').toString('base64url')));
    expectCursorError(() =>
      decodeCursor(Buffer.from(JSON.stringify({ id: ID })).toString('base64url')),
    );
    expectCursorError(() =>
      decodeCursor(Buffer.from(JSON.stringify({ v: 'x', id: 'not-a-uuid' })).toString('base64url')),
    );
    expectCursorError(() =>
      decodeCursor(Buffer.from(JSON.stringify({ v: '', id: ID })).toString('base64url')),
    );
    expectCursorError(() =>
      decodeCursor(
        Buffer.from(JSON.stringify({ v: 'x'.repeat(201), id: ID })).toString('base64url'),
      ),
    );
  });

  it('exposes a stable error contract', () => {
    const error = cursorInvalidError();

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('CURSOR_INVALID');
    expect(error.publicDetail).toBe('The pagination cursor is invalid.');
  });
});
