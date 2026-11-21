import {
  createCursorPaginationMeta,
  type CursorPaginationInput,
  type CursorPaginationMeta,
} from './pagination.js';

export interface SingleResponse<T> {
  data: T;
}

export interface CollectionResponse<T> {
  data: T[];
}

export interface PaginatedResponse<T> extends CollectionResponse<T> {
  meta: CursorPaginationMeta;
}

export function singleResponse<T>(data: T): SingleResponse<T> {
  return { data };
}

export function collectionResponse<T>(data: readonly T[]): CollectionResponse<T> {
  return { data: [...data] };
}

export function paginatedResponse<T>(
  data: readonly T[],
  pagination: CursorPaginationInput,
): PaginatedResponse<T> {
  return {
    data: [...data],
    meta: createCursorPaginationMeta(pagination),
  };
}
