import { expect } from 'vitest';

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const meta = (error as { meta?: unknown }).meta;

    return `${error.message} ${meta === undefined ? '' : JSON.stringify(meta)}`;
  }

  return String(error);
}

export function sqlState(error: unknown): string | undefined {
  const meta = (error as { meta?: { code?: unknown } }).meta;

  return typeof meta?.code === 'string' ? meta.code : undefined;
}

export async function expectSqlState(
  operation: Promise<unknown>,
  code: string,
  pattern?: RegExp,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (pattern !== undefined) {
      expect(errorText(error)).toMatch(pattern);
    }

    expect(sqlState(error), errorText(error)).toBe(code);
    return;
  }

  throw new Error(`Expected the operation to fail with SQLSTATE ${code}`);
}

export async function expectFailure(operation: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(errorText(error)).toMatch(pattern);
    return;
  }

  throw new Error(`Expected the operation to fail with ${pattern}`);
}

export async function expectUniqueViolation(
  operation: Promise<unknown>,
  fields: readonly string[],
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    const code = (error as { code?: string }).code;
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    const actualFields = Array.isArray(target)
      ? target.map(String)
      : typeof target === 'string'
        ? [target]
        : [];

    expect(code, errorText(error)).toBe('P2002');
    expect([...actualFields].sort(), errorText(error)).toEqual([...fields].sort());
    return;
  }

  throw new Error(`Expected a unique violation for ${fields.join(', ')}`);
}
