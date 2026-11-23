import { afterAll, describe, expect, it } from 'vitest';
import { expectFailure, expectSqlState } from './helpers/assertions.js';
import { createTestClient } from './helpers/database.js';
import {
  createAuditLog,
  createCheckIn,
  createEvent,
  createParticipant,
  createRefund,
  createRegistration,
  createTenant,
  createTicket,
  createTransaction,
  createUser,
} from './helpers/factories.js';

const client = createTestClient();

afterAll(async () => {
  await client.$disconnect();
});

async function createRefundFixture() {
  const tenant = await createTenant(client);
  const event = await createEvent(client, tenant.organization.id);
  const ticket = await createTicket(client, tenant.organization.id, event.id);
  const participant = await createParticipant(client, tenant.organization.id);
  const registration = await createRegistration(client, {
    organizationId: tenant.organization.id,
    eventId: event.id,
    participantId: participant.id,
    ticketId: ticket.id,
  });
  const transaction = await createTransaction(client, {
    organizationId: tenant.organization.id,
    eventId: event.id,
    type: 'TICKET',
    registrationId: registration.id,
  });
  const refund = await createRefund(client, {
    organizationId: tenant.organization.id,
    transactionId: transaction.id,
    amount: '10.00',
  });

  return { tenant, event, participant, registration, transaction, refund };
}

describe('immutable history tables', () => {
  it('rejects updates and deletes on refunds', async () => {
    const { refund } = await createRefundFixture();

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "refunds" SET "reason" = $2 WHERE "id" = $1::uuid',
        refund.id,
        'x',
      ),
      /immutable table refunds does not allow UPDATE/i,
    );
    await expectFailure(
      client.$executeRawUnsafe('DELETE FROM "refunds" WHERE "id" = $1::uuid', refund.id),
      /immutable table refunds does not allow DELETE/i,
    );

    expect(await client.refund.count({ where: { id: refund.id } })).toBe(1);
  });

  it('rejects updates and deletes on check-ins', async () => {
    const tenant = await createTenant(client);
    const event = await createEvent(client, tenant.organization.id);
    const ticket = await createTicket(client, tenant.organization.id, event.id);
    const participant = await createParticipant(client, tenant.organization.id);
    const registration = await createRegistration(client, {
      organizationId: tenant.organization.id,
      eventId: event.id,
      participantId: participant.id,
      ticketId: ticket.id,
    });
    const checkIn = await createCheckIn(client, {
      organizationId: tenant.organization.id,
      eventId: event.id,
      participantId: participant.id,
      registrationId: registration.id,
    });

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "check_ins" SET "status" = $2::"check_in_status" WHERE "id" = $1::uuid',
        checkIn.id,
        'INVALID',
      ),
      /immutable table check_ins does not allow UPDATE/i,
    );
    await expectFailure(
      client.$executeRawUnsafe('DELETE FROM "check_ins" WHERE "id" = $1::uuid', checkIn.id),
      /immutable table check_ins does not allow DELETE/i,
    );

    expect(await client.checkIn.count({ where: { id: checkIn.id } })).toBe(1);
  });

  it('rejects updates and deletes on audit logs', async () => {
    const tenant = await createTenant(client);
    const auditLog = await createAuditLog(client, tenant.organization.id);

    await expectFailure(
      client.$executeRawUnsafe(
        'UPDATE "audit_logs" SET "action_type" = $2 WHERE "id" = $1::uuid',
        auditLog.id,
        'CHANGED',
      ),
      /immutable table audit_logs does not allow UPDATE/i,
    );
    await expectFailure(
      client.$executeRawUnsafe('DELETE FROM "audit_logs" WHERE "id" = $1::uuid', auditLog.id),
      /immutable table audit_logs does not allow DELETE/i,
    );

    expect(await client.auditLog.count({ where: { id: auditLog.id } })).toBe(1);
  });

  it('rejects mutations issued through the Prisma client models', async () => {
    const { refund } = await createRefundFixture();

    await expectFailure(
      client.refund.update({ where: { id: refund.id }, data: { reason: 'changed' } }),
      /immutable table refunds does not allow UPDATE/i,
    );
    await expectFailure(
      client.refund.delete({ where: { id: refund.id } }),
      /immutable table refunds does not allow DELETE/i,
    );

    expect(await client.refund.count({ where: { id: refund.id } })).toBe(1);
  });

  it('reports the immutability violation as restrict_violation (23001)', async () => {
    const { refund } = await createRefundFixture();

    await expectSqlState(
      client.$executeRawUnsafe(
        'UPDATE "refunds" SET "reason" = $2 WHERE "id" = $1::uuid',
        refund.id,
        'x',
      ),
      '23001',
      /immutable table refunds does not allow UPDATE/i,
    );
  });

  it('refuses to null an immutable audit log actor', async () => {
    const tenant = await createTenant(client);
    const actor = await createUser(client);
    const auditLog = await createAuditLog(client, tenant.organization.id, {
      actorUserId: actor.id,
    });

    await expectSqlState(
      client.$executeRawUnsafe('DELETE FROM "users" WHERE "id" = $1::uuid', actor.id),
      '23001',
      /immutable table audit_logs does not allow UPDATE/i,
    );

    expect(await client.user.count({ where: { id: actor.id } })).toBe(1);
    expect(await client.auditLog.count({ where: { id: auditLog.id, actorUserId: actor.id } })).toBe(
      1,
    );
  });

  it('refuses to delete a user referenced by an immutable refund', async () => {
    const { tenant, transaction } = await createRefundFixture();
    const standaloneUser = await createUser(client);

    await createRefund(client, {
      organizationId: tenant.organization.id,
      transactionId: transaction.id,
      amount: '1.00',
      createdByUserId: standaloneUser.id,
    });

    await expectFailure(
      client.$executeRawUnsafe('DELETE FROM "users" WHERE "id" = $1::uuid', standaloneUser.id),
      /immutable table refunds does not allow UPDATE/i,
    );

    expect(await client.user.count({ where: { id: standaloneUser.id } })).toBe(1);
  });
});
