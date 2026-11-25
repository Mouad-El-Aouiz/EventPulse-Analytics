import type { RequestHandler } from 'express';
import { assertAllowedOrigin } from '../../../shared/http/origin.js';

export function createRequireOriginMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    try {
      assertAllowedOrigin(req, allowedOrigins);
      next();
    } catch (error) {
      next(error);
    }
  };
}
