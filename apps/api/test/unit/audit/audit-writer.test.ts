import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaAuditWriter } from '../../../src/modules/audit/audit.writer.js';

interface CreatedData {
  actionType: string;
  resourceType: string;
  metadata: Record<string, unknown>;
}

function createWriter() {
  const create = vi.fn().mockResolvedValue({});
  const client = { auditLog: { create } } as unknown as PrismaClient;

  return { writer: new PrismaAuditWriter(client), create };
}

const BASE_EVENT = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  category: 'AUTH' as const,
  result: 'SUCCESS' as const,
  actionType: 'LOGIN',
  resourceType: 'session',
};

function createdData(create: ReturnType<typeof vi.fn>): CreatedData {
  return create.mock.calls[0]?.[0]?.data as CreatedData;
}

describe('PrismaAuditWriter metadata hardening', () => {
  it('stores JSON-safe metadata and drops unserializable values', async () => {
    const { writer, create } = createWriter();
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    await writer.record({
      ...BASE_EVENT,
      metadata: { at: new Date('2026-01-01T00:00:00.000Z') },
    });

    expect(createdData(create).metadata).toEqual({ at: '2026-01-01T00:00:00.000Z' });

    create.mockClear();
    await writer.record({ ...BASE_EVENT, metadata: { circular } });

    expect(createdData(create).metadata).toEqual({ truncated: true });

    create.mockClear();
    await writer.record({ ...BASE_EVENT, metadata: { big: 10n } });

    expect(createdData(create).metadata).toEqual({ truncated: true });
  });

  it('replaces metadata above 8 KB and keeps the audit append-only call valid', async () => {
    const { writer, create } = createWriter();

    await writer.record({
      ...BASE_EVENT,
      metadata: { payload: 'a'.repeat(8_200) },
    });

    expect(createdData(create).metadata).toEqual({ truncated: true });
  });

  it('truncates action and resource type to their column widths', async () => {
    const { writer, create } = createWriter();

    await writer.record({
      ...BASE_EVENT,
      actionType: 'A'.repeat(120),
      resourceType: 'R'.repeat(80),
    });

    const data = createdData(create);

    expect(data.actionType).toHaveLength(80);
    expect(data.resourceType).toHaveLength(50);
  });

  it('defaults missing optional fields to null', async () => {
    const { writer, create } = createWriter();

    await writer.record(BASE_EVENT);

    const data = create.mock.calls[0]?.[0]?.data as Record<string, unknown>;

    expect(data.actorUserId).toBeNull();
    expect(data.resourceId).toBeNull();
    expect(data.ipAddress).toBeNull();
    expect(data.userAgent).toBeNull();
    expect(data.metadata).toEqual({});
  });
});
