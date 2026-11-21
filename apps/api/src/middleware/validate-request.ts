import type { RequestHandler } from 'express';
import type { ZodIssue, ZodType } from 'zod';
import { ValidationError, type ValidationIssue } from '../errors/validation-error.js';

const REQUEST_SECTIONS = ['body', 'params', 'query'] as const;

type RequestSection = (typeof REQUEST_SECTIONS)[number];

const DEFAULT_ISSUE_MESSAGE = 'Invalid value.';

export interface RequestValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

function getFormatMessage(format: string): string {
  switch (format) {
    case 'email':
      return 'Invalid email format.';
    case 'uuid':
      return 'Invalid UUID format.';
    case 'url':
      return 'Invalid URL format.';
    case 'datetime':
      return 'Invalid date-time format.';
    default:
      return 'Invalid format.';
  }
}

function getIssueMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case 'too_small':
      return 'Value is too small.';
    case 'too_big':
      return 'Value is too large.';
    case 'invalid_format':
      return getFormatMessage(issue.format);
    case 'unrecognized_keys':
      return 'Unrecognized field.';
    default:
      return DEFAULT_ISSUE_MESSAGE;
  }
}

function formatIssuePath(section: RequestSection, path: readonly PropertyKey[]): string {
  return [section, ...path.map((part) => String(part))].join('.');
}

function mapIssues(section: RequestSection, issues: readonly ZodIssue[]): ValidationIssue[] {
  return issues.flatMap((issue): ValidationIssue[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: formatIssuePath(section, [...issue.path, key]),
        code: issue.code,
        message: getIssueMessage(issue),
      }));
    }

    return [
      {
        path: formatIssuePath(section, issue.path),
        code: issue.code,
        message: getIssueMessage(issue),
      },
    ];
  });
}

export function validateRequest(schemas: RequestValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];
    const validatedSections: Partial<Record<RequestSection, unknown>> = {};

    for (const section of REQUEST_SECTIONS) {
      const schema = schemas[section];

      if (schema === undefined) {
        continue;
      }

      const result = schema.safeParse(req[section]);

      if (result.success) {
        validatedSections[section] = result.data;
      } else {
        issues.push(...mapIssues(section, result.error.issues));
      }
    }

    if (issues.length > 0) {
      next(new ValidationError(issues));
      return;
    }

    for (const section of REQUEST_SECTIONS) {
      if (!Object.hasOwn(validatedSections, section)) {
        continue;
      }

      Object.defineProperty(req, section, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: validatedSections[section],
      });
    }

    next();
  };
}
