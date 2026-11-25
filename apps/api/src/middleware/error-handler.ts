import type { ErrorRequestHandler } from 'express';
import { logger as defaultLogger } from '../config/logger.js';
import { AppError } from '../errors/app-error.js';
import { errorLogFields } from '../errors/error-logging.js';
import { mapErrorToProblemDetails, PROBLEM_DETAILS_MEDIA_TYPE } from '../errors/problem-details.js';

const INVALID_JSON_CODE = 'INVALID_JSON';
const PAYLOAD_TOO_LARGE_CODE = 'PAYLOAD_TOO_LARGE';
const ERROR_LOG_MESSAGE = 'HTTP request failed';

function hasErrorType(error: unknown, type: string): error is Error & { type: string } {
  return error instanceof Error && 'type' in error && error.type === type;
}

function normalizeError(error: unknown): unknown {
  if (error instanceof AppError) {
    return error;
  }

  if (hasErrorType(error, 'entity.parse.failed')) {
    return new AppError('Malformed JSON request body', {
      statusCode: 400,
      code: INVALID_JSON_CODE,
      publicDetail: 'The request body contains invalid JSON.',
      cause: error,
    });
  }

  if (hasErrorType(error, 'entity.too.large')) {
    return new AppError('Request payload too large', {
      statusCode: 413,
      code: PAYLOAD_TOO_LARGE_CODE,
      publicDetail: 'The request payload exceeds the allowed limit.',
      cause: error,
    });
  }

  return error;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  const normalizedError = normalizeError(error);
  const problem = mapErrorToProblemDetails(normalizedError, {
    requestId: req.requestId,
    instance: req.path,
  });

  const log = req.log ?? defaultLogger;
  const logError = normalizedError instanceof AppError ? normalizedError : error;
  const logContext = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ...errorLogFields(logError, { code: problem.code, status: problem.status }),
    isOperational: normalizedError instanceof AppError ? normalizedError.isOperational : false,
  };

  if (problem.status >= 500) {
    log.error(logContext, ERROR_LOG_MESSAGE);
  } else {
    log.warn(logContext, ERROR_LOG_MESSAGE);
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  if (normalizedError instanceof AppError && normalizedError.retryAfterSeconds !== undefined) {
    res.set('Retry-After', String(normalizedError.retryAfterSeconds));
  }

  res.set('Content-Type', PROBLEM_DETAILS_MEDIA_TYPE);
  res.status(problem.status).json(problem);
};
