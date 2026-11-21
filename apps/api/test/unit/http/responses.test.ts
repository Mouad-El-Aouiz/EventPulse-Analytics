import { describe, expect, it } from 'vitest';
import {
  collectionResponse,
  paginatedResponse,
  singleResponse,
  type CollectionResponse,
  type PaginatedResponse,
  type SingleResponse,
} from '../../../src/http/responses.js';

interface EventSummary {
  id: string;
  name: string;
}

const firstEvent: EventSummary = {
  id: '018f4a24-6c1e-7b2a-9f30-3d4e5f607182',
  name: 'Tech Summit 2026',
};

const secondEvent: EventSummary = {
  id: '018f4a24-9d2f-7c3b-8e41-5a6b7c8d9e0f',
  name: 'Product Design Forum',
};

describe('success response builders', () => {
  it('wraps a single resource in a data envelope', () => {
    const response: SingleResponse<EventSummary> = singleResponse(firstEvent);

    expect(response).toEqual({ data: firstEvent });
    expect(Object.keys(response)).toEqual(['data']);
  });

  it('wraps a collection in a data envelope', () => {
    const response: CollectionResponse<EventSummary> = collectionResponse([
      firstEvent,
      secondEvent,
    ]);

    expect(response).toEqual({ data: [firstEvent, secondEvent] });
    expect(Object.keys(response)).toEqual(['data']);
  });

  it('supports empty collections without adding metadata', () => {
    const response: CollectionResponse<EventSummary> = collectionResponse([]);

    expect(response).toEqual({ data: [] });
    expect(Object.keys(response)).toEqual(['data']);
  });

  it('copies the input collection instead of exposing the caller array', () => {
    const events = [firstEvent];
    const response = collectionResponse(events);

    events.push(secondEvent);

    expect(response.data).toEqual([firstEvent]);
  });

  it('builds a paginated collection with cursor metadata', () => {
    const response: PaginatedResponse<EventSummary> = paginatedResponse([firstEvent, secondEvent], {
      limit: 25,
      nextCursor: 'cursor-page-2',
    });

    expect(response).toEqual({
      data: [firstEvent, secondEvent],
      meta: {
        limit: 25,
        hasMore: true,
        nextCursor: 'cursor-page-2',
      },
    });
    expect(Object.keys(response)).toEqual(['data', 'meta']);
    expect(Object.keys(response.meta)).toEqual(['limit', 'hasMore', 'nextCursor']);
  });

  it('represents an empty final page without a next cursor', () => {
    const response: PaginatedResponse<EventSummary> = paginatedResponse([], {
      limit: 25,
      nextCursor: null,
    });

    expect(response).toEqual({
      data: [],
      meta: {
        limit: 25,
        hasMore: false,
        nextCursor: null,
      },
    });
  });

  it('copies paginated data before returning it', () => {
    const events = [firstEvent];
    const response = paginatedResponse(events, { limit: 25, nextCursor: null });

    events.push(secondEvent);

    expect(response.data).toEqual([firstEvent]);
  });
});
