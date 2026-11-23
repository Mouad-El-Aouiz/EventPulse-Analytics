import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { expectFailure, expectSqlState } from './helpers/assertions.js';
import { createTestClient } from './helpers/database.js';
import {
  createEvent,
  createParticipant,
  createRegistration,
  createTenant,
  createTicket,
  createTransaction,
} from './helpers/factories.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

interface PaidFixture {
  organizationId: string;
  transactionId: string;
  amount: string;
}

async function createPaidTransaction(database: PrismaClient, amount: string): Promise<PaidFixture> {
  const { organization } = await createTenant(database);
  const event = await createEvent(database, organization.id);
  const ticket = await createTicket(database, organization.id, event.id);
  const participant = await createParticipant(database, organization.id);
  const registration = await createRegistration(database, {
    organizationId: organization.id,
    eventId: event.id,
    participantId: participant.id,
    ticketId: ticket.id,
  });
  const transaction = await createTransaction(database, {
    organizationId: organization.id,
    eventId: event.id,
    type: 'TICKET',
    registrationId: registration.id,
    amount,
  });

  return {
    organizationId: organization.id,
    transactionId: transaction.id,
    amount,
  };
}

async function insertRefund(
  database: PrismaClient,
  fixture: PaidFixture,
  amount: string,
): Promise<void> {
  await database.$executeRawUnsafe(
    'INSERT INTO "refunds" ("organization_id", "transaction_id", "amount", "currency") VALUES ($1::uuid, $2::uuid, $3::numeric, $4)',
    fixture.organizationId,
    fixture.transactionId,
    amount,
    'EUR',
  );
}

describe('refund cap', () => {
  it('accepts cumulative refunds up to the paid amount and rejects the next cent', async () => {
    const fixture = await createPaidTransaction(client, '100.00');

    await insertRefund(client, fixture, '60.00');
    await insertRefund(client, fixture, '40.00');

    const total = await client.refund.aggregate({
      where: { transactionId: fixture.transactionId },
      _sum: { amount: true },
    });

    expect(Number(total._sum.amount)).toBe(100);

    await expectSqlState(insertRefund(client, fixture, '0.01'), '23514', /refund cap exceeded/i);
  });

  it('rejects a single refund above the paid amount', async () => {
    const fixture = await createPaidTransaction(client, '100.00');

    await expectSqlState(insertRefund(client, fixture, '100.01'), '23514', /refund cap exceeded/i);
  });

  it('rejects refunds for transactions that are not paid', async () => {
    const { organization } = await createTenant(client);
    const event = await createEvent(client, organization.id);
    const ticket = await createTicket(client, organization.id, event.id);
    const participant = await createParticipant(client, organization.id);
    const registration = await createRegistration(client, {
      organizationId: organization.id,
      eventId: event.id,
      participantId: participant.id,
      ticketId: ticket.id,
    });
    const transaction = await createTransaction(client, {
      organizationId: organization.id,
      eventId: event.id,
      type: 'TICKET',
      registrationId: registration.id,
      status: 'PENDING',
    });

    const fixture = {
      organizationId: organization.id,
      transactionId: transaction.id,
      amount: '100.00',
    };

    await expectSqlState(insertRefund(client, fixture, '10.00'), '23514', /has status PENDING/i);
  });

  it('rejects refunds for already refunded transactions', async () => {
    const fixture = await createPaidTransaction(client, '100.00');

    await client.$executeRawUnsafe(
      'UPDATE "transactions" SET "status" = $2::"transaction_status", "paid_at" = COALESCE("paid_at", now()) WHERE "id" = $1::uuid',
      fixture.transactionId,
      'REFUNDED',
    );

    await expectSqlState(insertRefund(client, fixture, '10.00'), '23514', /has status REFUNDED/i);
  });

  it('serializes concurrent refunds from two independent connections', async () => {
    const fixture = await createPaidTransaction(client, '100.00');
    const clientA = createTestClient(undefined, 1);
    const clientB = createTestClient(undefined, 1);

    // The trigger relies on SELECT ... FOR UPDATE under READ COMMITTED, the PostgreSQL
    // default. A REPEATABLE READ transaction can keep a stale SUM snapshot; the
    // application must therefore use READ COMMITTED for this guarantee.
    try {
      const results = await Promise.allSettled([
        insertRefund(clientA, fixture, '60.00'),
        insertRefund(clientB, fixture, '60.00'),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.status === 'rejected' ? String(rejected[0].reason) : '').toMatch(
        /refund cap exceeded/i,
      );

      const total = await client.refund.aggregate({
        where: { transactionId: fixture.transactionId },
        _sum: { amount: true },
      });

      expect(Number(total._sum.amount)).toBe(60);
    } finally {
      await Promise.allSettled([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });

  it('resists temporary tables shadowing the permanent transaction tables', async () => {
    const fixture = await createPaidTransaction(client, '100.00');
    const attackClient = createTestClient(undefined, 1);

    try {
      let reachedInsert = false;

      await expectFailure(
        (async () => {
          await attackClient.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "transactions" ("organization_id" uuid, "id" uuid, "amount" numeric(12,2), "status" text)',
            );
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "refunds" ("organization_id" uuid, "transaction_id" uuid, "amount" numeric(12,2))',
            );
            await tx.$executeRawUnsafe(
              'INSERT INTO "transactions" ("organization_id", "id", "amount", "status") VALUES ($1::uuid, $2::uuid, 1000.00, \'PAID\')',
              fixture.organizationId,
              fixture.transactionId,
            );

            reachedInsert = true;
            await tx.$executeRawUnsafe(
              'INSERT INTO public."refunds" ("organization_id", "transaction_id", "amount", "currency") VALUES ($1::uuid, $2::uuid, 500.00, \'EUR\')',
              fixture.organizationId,
              fixture.transactionId,
            );
            throw new Error('TEMP_SHADOW_ATTACK_ALLOWED');
          });
        })(),
        /refund cap exceeded/i,
      );

      expect(reachedInsert).toBe(true);
      expect(await client.refund.count({ where: { transactionId: fixture.transactionId } })).toBe(
        0,
      );
    } finally {
      await attackClient.$disconnect();
    }
  });

  it('resists temporary refunds shadowing the cumulative sum', async () => {
    const fixture = await createPaidTransaction(client, '100.00');

    await insertRefund(client, fixture, '60.00');

    const attackClient = createTestClient(undefined, 1);

    try {
      await expectFailure(
        (async () => {
          await attackClient.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "transactions" ("organization_id" uuid, "id" uuid, "amount" numeric(12,2), "status" text)',
            );
            await tx.$executeRawUnsafe(
              'CREATE TEMP TABLE "refunds" ("organization_id" uuid, "transaction_id" uuid, "amount" numeric(12,2))',
            );
            await tx.$executeRawUnsafe(
              'INSERT INTO "transactions" ("organization_id", "id", "amount", "status") VALUES ($1::uuid, $2::uuid, 100.00, \'PAID\')',
              fixture.organizationId,
              fixture.transactionId,
            );

            await tx.$executeRawUnsafe(
              'INSERT INTO public."refunds" ("organization_id", "transaction_id", "amount", "currency") VALUES ($1::uuid, $2::uuid, 50.00, \'EUR\')',
              fixture.organizationId,
              fixture.transactionId,
            );
            throw new Error('TEMP_SHADOWS_MUST_NOT_ALLOW_THIS_REFUND');
          });
        })(),
        /refund cap exceeded/i,
      );

      const total = await client.refund.aggregate({
        where: { transactionId: fixture.transactionId },
        _sum: { amount: true },
      });

      expect(Number(total._sum.amount)).toBe(60);
    } finally {
      await attackClient.$disconnect();
    }
  });

  it('documents that the concurrency guarantee assumes READ COMMITTED', async () => {
    const rows = await client.$queryRaw<Array<{ transaction_isolation: string }>>`
      SHOW transaction_isolation
    `;

    expect(rows[0]?.transaction_isolation).toBe('read committed');
  });
});
