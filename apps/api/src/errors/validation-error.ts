import { AppError } from './app-error.js';

export const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';
export const VALIDATION_ERROR_DETAIL = 'The request contains invalid data.';

const VALIDATION_ERROR_STATUS_CODE = 400;
const VALIDATION_ERROR_MESSAGE = 'Request validation failed';

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export class ValidationError extends AppError {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(VALIDATION_ERROR_MESSAGE, {
      statusCode: VALIDATION_ERROR_STATUS_CODE,
      code: VALIDATION_ERROR_CODE,
      publicDetail: VALIDATION_ERROR_DETAIL,
    });

    this.issues = issues.map(({ path, code, message }) => ({ path, code, message }));
  }
}
