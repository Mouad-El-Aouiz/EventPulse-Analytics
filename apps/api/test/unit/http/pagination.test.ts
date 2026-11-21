import { describe, expect, it } from 'vitest';
import {
  calculateOffsetPagination,
  createCursorPaginationMeta,
} from '../../../src/http/pagination.js';

describe('calculateOffsetPagination', () => {
  it('calculates the first page from offset zero', () => {
    expect(calculateOffsetPagination({ page: 1, limit: 20, total: 100 })).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
      total: 100,
      totalPages: 5,
    });
  });

  it('calculates a later page offset', () => {
    expect(calculateOffsetPagination({ page: 3, limit: 20, total: 100 })).toEqual({
      page: 3,
      limit: 20,
      offset: 40,
      total: 100,
      totalPages: 5,
    });
  });

  it('returns zero pages for an empty collection', () => {
    expect(calculateOffsetPagination({ page: 1, limit: 25, total: 0 })).toEqual({
      page: 1,
      limit: 25,
      offset: 0,
      total: 0,
      totalPages: 0,
    });
  });

  it('returns one page when the total is smaller than the limit', () => {
    expect(calculateOffsetPagination({ page: 1, limit: 25, total: 10 })).toEqual({
      page: 1,
      limit: 25,
      offset: 0,
      total: 10,
      totalPages: 1,
    });
  });

  it('calculates an exact number of pages when the total is divisible by the limit', () => {
    expect(calculateOffsetPagination({ page: 4, limit: 25, total: 100 })).toEqual({
      page: 4,
      limit: 25,
      offset: 75,
      total: 100,
      totalPages: 4,
    });
  });

  it('rounds up a partial last page', () => {
    expect(calculateOffsetPagination({ page: 5, limit: 25, total: 101 })).toEqual({
      page: 5,
      limit: 25,
      offset: 100,
      total: 101,
      totalPages: 5,
    });
  });

  it('calculates the offset of the last page consistently', () => {
    const result = calculateOffsetPagination({ page: 5, limit: 20, total: 100 });

    expect(result.offset).toBe(80);
    expect(result.offset + result.limit).toBe(result.total);
    expect(result.page).toBe(result.totalPages);
  });

  it('keeps page, limit, offset, total and totalPages consistent across boundaries', () => {
    const examples = [
      { page: 1, limit: 100, total: 1, offset: 0, totalPages: 1 },
      { page: 2, limit: 10, total: 20, offset: 10, totalPages: 2 },
      { page: 3, limit: 10, total: 21, offset: 20, totalPages: 3 },
      { page: 50, limit: 100, total: 5_000, offset: 4_900, totalPages: 50 },
    ];

    for (const example of examples) {
      const result = calculateOffsetPagination({
        page: example.page,
        limit: example.limit,
        total: example.total,
      });

      expect(result).toEqual({
        page: example.page,
        limit: example.limit,
        offset: example.offset,
        total: example.total,
        totalPages: example.totalPages,
      });
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid page value: %s',
    (page) => {
      expect(() => calculateOffsetPagination({ page, limit: 25, total: 100 })).toThrow(RangeError);
    },
  );

  it.each([0, -1, 1.5, 101, Number.POSITIVE_INFINITY])(
    'rejects an invalid limit value: %s',
    (limit) => {
      expect(() => calculateOffsetPagination({ page: 1, limit, total: 100 })).toThrow(RangeError);
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid total value: %s',
    (total) => {
      expect(() => calculateOffsetPagination({ page: 1, limit: 25, total })).toThrow(RangeError);
    },
  );

  it('rejects an offset outside the safe integer range', () => {
    expect(() =>
      calculateOffsetPagination({ page: Number.MAX_SAFE_INTEGER, limit: 100, total: 100 }),
    ).toThrow(RangeError);
  });
});

describe('createCursorPaginationMeta', () => {
  it('derives hasMore from a non-null cursor', () => {
    expect(createCursorPaginationMeta({ limit: 25, nextCursor: 'opaque-cursor' })).toEqual({
      limit: 25,
      hasMore: true,
      nextCursor: 'opaque-cursor',
    });
  });

  it('marks the final page when the cursor is null', () => {
    expect(createCursorPaginationMeta({ limit: 100, nextCursor: null })).toEqual({
      limit: 100,
      hasMore: false,
      nextCursor: null,
    });
  });

  it.each([0, 101, 1.5, Number.NaN])('rejects an invalid limit value: %s', (limit) => {
    expect(() => createCursorPaginationMeta({ limit, nextCursor: null })).toThrow(RangeError);
  });

  it('rejects an empty cursor', () => {
    expect(() => createCursorPaginationMeta({ limit: 25, nextCursor: '' })).toThrow(TypeError);
  });
});
