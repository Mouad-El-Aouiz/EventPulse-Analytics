export const MIN_PAGE_LIMIT = 1;
export const MAX_PAGE_LIMIT = 100;

export interface OffsetPaginationInput {
  page: number;
  limit: number;
  total: number;
}

export interface OffsetPagination {
  page: number;
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
}

export interface CursorPaginationInput {
  limit: number;
  nextCursor: string | null;
}

export interface CursorPaginationMeta {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

function assertPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < MIN_PAGE_LIMIT || limit > MAX_PAGE_LIMIT) {
    throw new RangeError(
      `limit must be an integer between ${MIN_PAGE_LIMIT} and ${MAX_PAGE_LIMIT}.`,
    );
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

// Offset pagination remains available for internal report exports; v1 collections use cursors.
export function calculateOffsetPagination({
  page,
  limit,
  total,
}: OffsetPaginationInput): OffsetPagination {
  assertPositiveSafeInteger(page, 'page');
  assertPageLimit(limit);
  assertNonNegativeSafeInteger(total, 'total');

  const offset = (page - 1) * limit;

  if (!Number.isSafeInteger(offset)) {
    throw new RangeError('offset must be a safe integer.');
  }

  return {
    page,
    limit,
    offset,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export function createCursorPaginationMeta({
  limit,
  nextCursor,
}: CursorPaginationInput): CursorPaginationMeta {
  assertPageLimit(limit);

  if (nextCursor !== null && nextCursor.length === 0) {
    throw new TypeError('nextCursor must be null or a non-empty string.');
  }

  return {
    limit,
    hasMore: nextCursor !== null,
    nextCursor,
  };
}
