import { STATUS_CODES } from 'node:http';
import { AppError } from './app-error.js';
import { ValidationError, type ValidationIssue } from './validation-error.js';

export const PROBLEM_DETAILS_MEDIA_TYPE = 'application/problem+json';
export const DEFAULT_PROBLEM_TYPE = 'about:blank';
export const INTERNAL_SERVER_ERROR_CODE = 'INTERNAL_SERVER_ERROR';

const INTERNAL_SERVER_ERROR_STATUS = 500;

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  requestId?: string;
  errors?: ValidationIssue[];
}

export interface ProblemDetailsContext {
  requestId?: string;
  instance?: string;
}

function getTitle(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? 'Error';
}

export function mapAppErrorToProblemDetails(
  error: AppError,
  context: ProblemDetailsContext = {},
): ProblemDetails {
  return {
    type: DEFAULT_PROBLEM_TYPE,
    title: getTitle(error.statusCode),
    status: error.statusCode,
    ...(error.publicDetail !== undefined ? { detail: error.publicDetail } : {}),
    ...(context.instance !== undefined ? { instance: context.instance } : {}),
    code: error.code,
    ...(context.requestId !== undefined ? { requestId: context.requestId } : {}),
    ...(error instanceof ValidationError
      ? {
          errors: error.issues.map(({ path, code, message }) => ({ path, code, message })),
        }
      : {}),
  };
}

export function mapErrorToProblemDetails(
  error: unknown,
  context: ProblemDetailsContext = {},
): ProblemDetails {
  if (error instanceof AppError) {
    return mapAppErrorToProblemDetails(error, context);
  }

  return {
    type: DEFAULT_PROBLEM_TYPE,
    title: getTitle(INTERNAL_SERVER_ERROR_STATUS),
    status: INTERNAL_SERVER_ERROR_STATUS,
    ...(context.instance !== undefined ? { instance: context.instance } : {}),
    code: INTERNAL_SERVER_ERROR_CODE,
    ...(context.requestId !== undefined ? { requestId: context.requestId } : {}),
  };
}
