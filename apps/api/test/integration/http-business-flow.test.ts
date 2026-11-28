import type { Express } from 'express';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Membership, Organization, User } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { getPrismaClient } from '../../src/database/prisma.js';
import { flushAuthAudits } from '../../src/modules/auth/auth.module.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { getSharedRedis } from '../../src/shared/redis/redis-connection.js';
import { createTestClient } from './helpers/database.js';
import {
  createMembership,
  createOrganization,
  createUser,
  unique,
  uniqueEmail,
} from './helpers/factories.js';

const PASSWORD = 'business-flow-password';
const passwords = new PasswordService();
const client = createTestClient();
const app: Express = createApp({ logger: pino({ level: 'silent' }) });

interface Account {
  user: User;
  membership: Membership;
  token: string;
}

let passwordHash: string;
let organization: Organization;
let owner: Account;
let admin: Account;
let manager: Account;
let analyst: Account;
let viewer: Account;
let foreignOwner: Account;

let eventId: string;
let draftEventId: string;
let ticketId: string;
let participantAId: string;
let participantBId: string;
let registrationAId: string;
let registrationBId: string;

interface Flow {
  transactionId: string;
  firstRefundId: string;
  checkInId: string;
}

const flow: Partial<Flow> = {};

function authorization(account: Account) {
  return { Authorization: `Bearer ${account.token}` };
}

async function login(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });

  expect(response.status).toBe(200);

  return response.body.data.accessToken as string;
}

async function createMember(organizationId: string, role: Membership['role']): Promise<Account> {
  const user = await createUser(client);

  await client.user.update({ where: { id: user.id }, data: { passwordHash } });

  const membership = await createMembership(client, organizationId, user.id, role);
  const token = await login(user.email);

  return { user, membership, token };
}

function eventWindow() {
  const now = Date.now();

  return {
    startAt: new Date(now - 30 * 60 * 1000).toISOString(),
    endAt: new Date(now + 60 * 60 * 1000).toISOString(),
  };
}

async function createEvent(token: string, overrides: { name?: string } = {}): Promise<string> {
  const window = eventWindow();
  const response = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides.name ?? unique('Business Event'),
      type: 'CONFERENCE',
      startAt: window.startAt,
      endAt: window.endAt,
      timezone: 'Europe/Paris',
    });

  expect(response.status).toBe(201);

  return response.body.data.id as string;
}

async function createParticipant(token: string, firstName: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/participants')
    .set('Authorization', `Bearer ${token}`)
    .send({ firstName, lastName: unique('Last'), email: uniqueEmail(firstName.toLowerCase()) });

  expect(response.status).toBe(201);

  return response.body.data.id as string;
}

async function createConfirmedRegistration(
  participantId: string,
  ticket: string,
  event: string = eventId,
): Promise<string> {
  const created = await request(app)
    .post('/api/v1/registrations')
    .set(authorization(owner))
    .send({ eventId: event, participantId, ticketId: ticket, source: 'MANUAL' });

  expect(created.status).toBe(201);

  const confirmed = await request(app)
    .post(`/api/v1/registrations/${created.body.data.id}/confirm`)
    .set(authorization(owner));

  expect(confirmed.status).toBe(200);

  return created.body.data.id as string;
}

beforeAll(async () => {
  const redis = getSharedRedis();

  await vi.waitFor(
    () => {
      expect(redis.status).toBe('ready');
    },
    { timeout: 5000 },
  );

  await redis.ping();

  passwordHash = await passwords.hash(PASSWORD);
  organization = await createOrganization(client);
  const ownerUser = await createUser(client);

  await client.user.update({ where: { id: ownerUser.id }, data: { passwordHash } });
  const ownerMembership = await createMembership(client, organization.id, ownerUser.id, 'OWNER');

  owner = {
    user: ownerUser,
    membership: ownerMembership,
    token: await login(ownerUser.email),
  };
  admin = await createMember(organization.id, 'ADMIN');
  manager = await createMember(organization.id, 'EVENT_MANAGER');
  analyst = await createMember(organization.id, 'ANALYST');
  viewer = await createMember(organization.id, 'VIEWER');

  const foreignOrganization = await createOrganization(client);
  const foreignUser = await createUser(client);

  await client.user.update({ where: { id: foreignUser.id }, data: { passwordHash } });
  const foreignMembership = await createMembership(
    client,
    foreignOrganization.id,
    foreignUser.id,
    'OWNER',
  );

  foreignOwner = {
    user: foreignUser,
    membership: foreignMembership,
    token: await login(foreignUser.email),
  };

  eventId = await createEvent(owner.token, { name: unique('Ongoing Summit') });
  draftEventId = await createEvent(owner.token, { name: unique('Draft Summit') });

  const published = await request(app)
    .post(`/api/v1/events/${eventId}/publish`)
    .set(authorization(owner));
  const started = await request(app)
    .post(`/api/v1/events/${eventId}/start`)
    .set(authorization(owner));
  const assigned = await request(app)
    .patch(`/api/v1/events/${eventId}/manager`)
    .set(authorization(admin))
    .send({ membershipId: manager.membership.id });

  expect(published.status).toBe(200);
  expect(started.body.data.status).toBe('ONGOING');
  expect(assigned.status).toBe(200);

  const ticket = await request(app)
    .post(`/api/v1/events/${eventId}/tickets`)
    .set(authorization(owner))
    .send({ name: 'Standard', priceAmount: '25.00' });

  expect(ticket.status).toBe(201);
  ticketId = ticket.body.data.id as string;

  const participantA = await request(app)
    .post('/api/v1/participants')
    .set(authorization(owner))
    .send({ firstName: 'Ada', lastName: 'Lovelace', email: uniqueEmail('ada') });
  const participantB = await request(app)
    .post('/api/v1/participants')
    .set(authorization(owner))
    .send({ firstName: 'Grace', lastName: 'Hopper', email: uniqueEmail('grace') });

  expect(participantA.status).toBe(201);
  expect(participantB.status).toBe(201);
  participantAId = participantA.body.data.id as string;
  participantBId = participantB.body.data.id as string;

  const registrationA = await request(app)
    .post('/api/v1/registrations')
    .set(authorization(owner))
    .send({ eventId, participantId: participantAId, ticketId, source: 'MANUAL' });
  const registrationB = await request(app)
    .post('/api/v1/registrations')
    .set(authorization(owner))
    .send({ eventId, participantId: participantBId, ticketId, source: 'MANUAL' });

  expect(registrationA.status).toBe(201);
  expect(registrationB.status).toBe(201);
  registrationAId = registrationA.body.data.id as string;
  registrationBId = registrationB.body.data.id as string;

  const confirmedA = await request(app)
    .post(`/api/v1/registrations/${registrationAId}/confirm`)
    .set(authorization(owner));
  const confirmedB = await request(app)
    .post(`/api/v1/registrations/${registrationBId}/confirm`)
    .set(authorization(owner));

  expect(confirmedA.body.data.status).toBe('CONFIRMED');
  expect(confirmedB.body.data.status).toBe('CONFIRMED');
});

afterAll(async () => {
  await flushAuthAudits();
  await client.$disconnect();
  await getPrismaClient().$disconnect();
});

describe('Business integration flow', () => {
  it('records a ticket transaction, refunds within the cap, and a valid check-in', async () => {
    const created = await request(app)
      .post('/api/v1/transactions')
      .set(authorization(owner))
      .send({ eventId, type: 'TICKET', amount: '25.00', registrationId: registrationAId });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      type: 'TICKET',
      status: 'PENDING',
      amount: '25.00',
      currency: 'EUR',
      registrationId: registrationAId,
    });

    const transactionId = created.body.data.id as string;
    flow.transactionId = transactionId;

    const duplicate = await request(app)
      .post('/api/v1/transactions')
      .set(authorization(owner))
      .send({ eventId, type: 'TICKET', amount: '25.00', registrationId: registrationAId });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('PAY_DUPLICATE_TRANSACTION');

    const mismatch = await request(app)
      .post('/api/v1/transactions')
      .set(authorization(owner))
      .send({
        eventId: draftEventId,
        type: 'TICKET',
        amount: '25.00',
        registrationId: registrationAId,
      });

    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe('PAY_REFERENCE_INVALID');

    const paid = await request(app)
      .patch(`/api/v1/transactions/${transactionId}`)
      .set(authorization(owner))
      .send({ status: 'PAID' });

    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.paidAt).toEqual(expect.any(String));

    const invalidTransition = await request(app)
      .patch(`/api/v1/transactions/${transactionId}`)
      .set(authorization(owner))
      .send({ status: 'FAILED' });

    expect(invalidTransition.status).toBe(422);
    expect(invalidTransition.body.code).toBe('PAY_INVALID_TRANSITION');

    const partial = await request(app)
      .post(`/api/v1/transactions/${transactionId}/refunds`)
      .set(authorization(owner))
      .send({ amount: '10.00', reason: 'Partial refund' });

    expect(partial.status).toBe(201);
    expect(partial.body.data).toMatchObject({
      amount: '10.00',
      transactionId,
    });
    expect(partial.body.data.transaction.status).toBe('PARTIALLY_REFUNDED');
    flow.firstRefundId = partial.body.data.id as string;

    const second = await request(app)
      .post(`/api/v1/transactions/${transactionId}/refunds`)
      .set(authorization(owner))
      .send({ amount: '15.00', reason: 'Final refund' });

    expect(second.status).toBe(201);
    expect(second.body.data.transaction).toMatchObject({
      id: transactionId,
      status: 'REFUNDED',
      amount: '25.00',
    });

    const overRefund = await request(app)
      .post(`/api/v1/transactions/${transactionId}/refunds`)
      .set(authorization(owner))
      .send({ amount: '0.01' });

    expect(overRefund.status).toBe(422);
    expect(overRefund.body.code).toBe('PAY_REFUND_NOT_ALLOWED');

    const transaction = await request(app)
      .get(`/api/v1/transactions/${transactionId}`)
      .set(authorization(owner));

    expect(transaction.status).toBe(200);
    expect(transaction.body.data).toMatchObject({ status: 'REFUNDED', amount: '25.00' });

    const refunds = await request(app)
      .get('/api/v1/refunds')
      .query({ eventId })
      .set(authorization(owner));

    expect(refunds.status).toBe(200);
    expect(refunds.body.data).toHaveLength(2);
    expect(refunds.body.data.map((refund: { amount: string }) => refund.amount).sort()).toEqual([
      '10.00',
      '15.00',
    ]);

    const refundDetail = await request(app)
      .get(`/api/v1/refunds/${flow.firstRefundId}`)
      .set(authorization(owner));

    expect(refundDetail.status).toBe(200);
    expect(refundDetail.body.data.id).toBe(flow.firstRefundId);

    const checkIn = await request(app)
      .post('/api/v1/check-ins')
      .set(authorization(owner))
      .send({ eventId, participantId: participantAId, registrationId: registrationAId });

    expect(checkIn.status).toBe(201);
    expect(checkIn.body.data).toMatchObject({
      eventId,
      participantId: participantAId,
      registrationId: registrationAId,
      status: 'VALID',
      reason: null,
    });
    flow.checkInId = checkIn.body.data.id as string;

    const duplicateCheckIn = await request(app)
      .post('/api/v1/check-ins')
      .set(authorization(owner))
      .send({ eventId, participantId: participantAId, registrationId: registrationAId });

    expect(duplicateCheckIn.status).toBe(409);
    expect(duplicateCheckIn.body.code).toBe('CHK_DUPLICATE');

    const mutated = await request(app)
      .patch(`/api/v1/check-ins/${flow.checkInId}`)
      .set(authorization(owner))
      .send({ status: 'INVALID' });
    const deleted = await request(app)
      .delete(`/api/v1/check-ins/${flow.checkInId}`)
      .set(authorization(owner));

    expect(mutated.status).toBe(404);
    expect(deleted.status).toBe(404);

    const blockedRegistrationDelete = await request(app)
      .delete(`/api/v1/registrations/${registrationAId}`)
      .set(authorization(owner));

    expect(blockedRegistrationDelete.status).toBe(422);
    expect(blockedRegistrationDelete.body.code).toBe('REG_DELETE_BLOCKED');

    const blockedTicketDelete = await request(app)
      .delete(`/api/v1/events/${eventId}/tickets/${ticketId}`)
      .set(authorization(owner));

    expect(blockedTicketDelete.status).toBe(409);
    expect(blockedTicketDelete.body.code).toBe('TICKET_IN_USE');

    const blockedEventDelete = await request(app)
      .delete(`/api/v1/events/${eventId}`)
      .set(authorization(owner));

    expect(blockedEventDelete.status).toBe(422);
    expect(blockedEventDelete.body.code).toBe('EVT_DELETE_NOT_ALLOWED');
  });

  it('records INVALID check-ins with the documented reason priority', async () => {
    const outsideWindow = await request(app)
      .post('/api/v1/check-ins')
      .set(authorization(owner))
      .send({
        eventId,
        participantId: participantBId,
        registrationId: registrationBId,
        checkedInAt: '2026-01-01T09:00:00.000Z',
      });

    expect(outsideWindow.status).toBe(201);
    expect(outsideWindow.body.data).toMatchObject({
      status: 'INVALID',
      reason: 'OUTSIDE_WINDOW',
    });

    const missingParticipant = await request(app)
      .post('/api/v1/check-ins')
      .set(authorization(owner))
      .send({
        eventId,
        participantId: '99999999-9999-4999-8999-999999999999',
        registrationId: registrationBId,
      });

    expect(missingParticipant.status).toBe(201);
    expect(missingParticipant.body.data).toMatchObject({
      status: 'INVALID',
      reason: 'PARTICIPANT_NOT_FOUND',
      participantId: null,
    });

    const missingEvent = await request(app)
      .post('/api/v1/check-ins')
      .set(authorization(owner))
      .send({
        eventId: '99999999-9999-4999-8999-999999999999',
        participantId: participantBId,
        registrationId: registrationBId,
      });

    expect(missingEvent.status).toBe(201);
    expect(missingEvent.body.data).toMatchObject({
      status: 'INVALID',
      reason: 'EVENT_NOT_FOUND',
      eventId: null,
    });
  });

  it('restricts cancellation after a valid check-in to OWNER and ADMIN with audit', async () => {
    const byManager = await request(app)
      .post(`/api/v1/registrations/${registrationAId}/cancel`)
      .set(authorization(manager));

    expect(byManager.status).toBe(403);

    const byAdmin = await request(app)
      .post(`/api/v1/registrations/${registrationAId}/cancel`)
      .set(authorization(admin));

    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.status).toBe('CANCELLED');
    expect(byAdmin.body.data.cancelledAt).toEqual(expect.any(String));

    const auditResponse = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType: 'REGISTRATION_CANCELLED_AFTER_CHECK_IN', resourceId: registrationAId })
      .set(authorization(admin));

    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body.data).toHaveLength(1);
    expect(auditResponse.body.data[0].metadata).toMatchObject({ previousStatus: 'CONFIRMED' });
    expect(JSON.stringify(auditResponse.body)).not.toContain(PASSWORD);
  });

  it('exposes the documented audit trail for financial and access actions', async () => {
    const transactionAudit = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType: 'TRANSACTION_RECORDED', resourceId: flow.transactionId })
      .set(authorization(owner));
    const refundAudit = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType: 'REFUND_RECORDED', resourceId: flow.firstRefundId })
      .set(authorization(owner));
    const checkInAudit = await request(app)
      .get('/api/v1/audit-logs')
      .query({ actionType: 'CHECK_IN_RECORDED', resourceId: flow.checkInId })
      .set(authorization(owner));

    expect(transactionAudit.body.data).toHaveLength(1);
    expect(transactionAudit.body.data[0]).toMatchObject({
      category: 'FINANCIAL',
      result: 'SUCCESS',
      resourceType: 'transaction',
    });
    expect(refundAudit.body.data).toHaveLength(1);
    expect(refundAudit.body.data[0].metadata).toMatchObject({
      transactionId: flow.transactionId,
      amount: '10.00',
      resultingStatus: 'PARTIALLY_REFUNDED',
    });
    expect(checkInAudit.body.data).toHaveLength(1);
    expect(checkInAudit.body.data[0]).toMatchObject({
      category: 'SENSITIVE_DATA',
      result: 'SUCCESS',
    });
    expect(JSON.stringify(checkInAudit.body)).not.toContain('password');
  });
});

describe('Access control and tenant isolation', () => {
  it('enforces the role matrix across new modules', async () => {
    const attempts = [
      { account: analyst, method: 'get', path: '/api/v1/participants' },
      { account: viewer, method: 'get', path: '/api/v1/participants' },
      { account: analyst, method: 'get', path: '/api/v1/registrations' },
      { account: viewer, method: 'get', path: `/api/v1/registrations/${registrationBId}` },
      { account: analyst, method: 'get', path: '/api/v1/transactions' },
      { account: viewer, method: 'get', path: '/api/v1/transactions' },
      { account: analyst, method: 'get', path: '/api/v1/refunds' },
      { account: viewer, method: 'get', path: '/api/v1/check-ins' },
      { account: analyst, method: 'post', path: '/api/v1/check-ins' },
      { account: viewer, method: 'post', path: '/api/v1/participants' },
    ] as const;

    for (const attempt of attempts) {
      const response = await request(app)
        [attempt.method](attempt.path)
        .set(authorization(attempt.account));

      expect(response.status).toBe(403);
    }

    const events = await request(app).get(`/api/v1/events/${eventId}`).set(authorization(analyst));

    expect(events.status).toBe(200);
  });

  it('limits EVENT_MANAGER to assigned events and requires an event filter', async () => {
    const assignedEvent = await request(app)
      .get(`/api/v1/events/${eventId}`)
      .set(authorization(manager));
    const unassignedEvent = await request(app)
      .get(`/api/v1/events/${draftEventId}`)
      .set(authorization(manager));

    expect(assignedEvent.status).toBe(200);
    expect(unassignedEvent.status).toBe(403);

    const missingFilters = [
      { path: '/api/v1/registrations', code: 'REG_EVENT_REQUIRED' },
      { path: '/api/v1/transactions', code: 'TXN_EVENT_REQUIRED' },
      { path: '/api/v1/refunds', code: 'REFUND_EVENT_REQUIRED' },
      { path: '/api/v1/check-ins', code: 'CHK_EVENT_REQUIRED' },
    ];

    for (const expectation of missingFilters) {
      const response = await request(app).get(expectation.path).set(authorization(manager));

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(expectation.code);
    }

    const assignedReads = [
      '/api/v1/registrations?eventId=' + eventId,
      '/api/v1/transactions?eventId=' + eventId,
      '/api/v1/refunds?eventId=' + eventId,
      '/api/v1/check-ins?eventId=' + eventId,
      '/api/v1/participants?eventId=' + eventId,
    ];

    for (const path of assignedReads) {
      const response = await request(app).get(path).set(authorization(manager));

      expect(response.status).toBe(200);
    }

    const unassignedReads = [
      '/api/v1/registrations?eventId=' + draftEventId,
      '/api/v1/transactions?eventId=' + draftEventId,
      '/api/v1/refunds?eventId=' + draftEventId,
      '/api/v1/check-ins?eventId=' + draftEventId,
      '/api/v1/participants?eventId=' + draftEventId,
    ];

    for (const path of unassignedReads) {
      const response = await request(app).get(path).set(authorization(manager));

      expect(response.status).toBe(403);
    }

    const writeOutsideScope = await request(app)
      .post('/api/v1/registrations')
      .set(authorization(manager))
      .send({ eventId: draftEventId, participantId: participantBId, ticketId });

    expect(writeOutsideScope.status).toBe(403);

    const auditDenied = await request(app).get('/api/v1/audit-logs').set(authorization(manager));

    expect(auditDenied.status).toBe(403);
  });

  it('never exposes another tenant resources', async () => {
    const probes = [
      { path: `/api/v1/events/${eventId}`, code: 'EVENT_NOT_FOUND' },
      { path: `/api/v1/participants/${participantAId}`, code: 'PARTICIPANT_NOT_FOUND' },
      { path: `/api/v1/registrations/${registrationAId}`, code: 'REGISTRATION_NOT_FOUND' },
      { path: `/api/v1/transactions/${flow.transactionId}`, code: 'TRANSACTION_NOT_FOUND' },
      { path: `/api/v1/refunds/${flow.firstRefundId}`, code: 'REFUND_NOT_FOUND' },
      { path: `/api/v1/check-ins/${flow.checkInId}`, code: 'CHECK_IN_NOT_FOUND' },
    ];

    for (const probe of probes) {
      const response = await request(app).get(probe.path).set(authorization(foreignOwner));

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(probe.code);
    }

    const foreignAudit = await request(app)
      .get('/api/v1/audit-logs')
      .query({ resourceId: flow.transactionId })
      .set(authorization(foreignOwner));

    expect(foreignAudit.status).toBe(200);
    expect(foreignAudit.body.data).toHaveLength(0);
  });
});

describe('Module integrity edge cases', () => {
  it('protects participant merge, anonymization and erasure lifecycles', async () => {
    const checkedInParticipant = await createParticipant(owner.token, 'Cara');
    const checkedInRegistration = await createConfirmedRegistration(checkedInParticipant, ticketId);
    const checkIn = await request(app).post('/api/v1/check-ins').set(authorization(owner)).send({
      eventId,
      participantId: checkedInParticipant,
      registrationId: checkedInRegistration,
    });

    expect(checkIn.status).toBe(201);

    const mergeWithCheckIn = await request(app)
      .post('/api/v1/participants/merge')
      .set(authorization(admin))
      .send({
        sourceParticipantId: checkedInParticipant,
        targetParticipantId: participantAId,
        confirm: true,
      });

    expect(mergeWithCheckIn.status).toBe(409);
    expect(mergeWithCheckIn.body.code).toBe('PARTICIPANT_MERGE_BLOCKED');

    const eraseWithFinancialHistory = await request(app)
      .post(`/api/v1/participants/${participantAId}/erase`)
      .set(authorization(admin));

    expect(eraseWithFinancialHistory.status).toBe(409);
    expect(eraseWithFinancialHistory.body.code).toBe('PARTICIPANT_ERASURE_BLOCKED');

    const source = await createParticipant(owner.token, 'MergeSource');
    const target = await createParticipant(owner.token, 'MergeTarget');
    const merged = await request(app)
      .post('/api/v1/participants/merge')
      .set(authorization(admin))
      .send({ sourceParticipantId: source, targetParticipantId: target, confirm: true });

    expect(merged.status).toBe(200);
    expect(merged.body.data.id).toBe(target);

    const absorbed = await request(app)
      .get(`/api/v1/participants/${source}`)
      .set(authorization(owner));

    expect(absorbed.status).toBe(404);

    const anonymized = await request(app)
      .post(`/api/v1/participants/${target}/anonymize`)
      .set(authorization(admin));
    const anonymizedAgain = await request(app)
      .post(`/api/v1/participants/${target}/anonymize`)
      .set(authorization(admin));

    expect(anonymized.status).toBe(200);
    expect(anonymized.body.data.email).toMatch(new RegExp(`^anonymized-${target}@`));
    expect(anonymizedAgain.body.data.email).toBe(anonymized.body.data.email);

    const fresh = await createParticipant(owner.token, 'Erasable');
    const erased = await request(app)
      .post(`/api/v1/participants/${fresh}/erase`)
      .set(authorization(admin));

    expect(erased.status).toBe(204);
    await expect(client.participant.findUnique({ where: { id: fresh } })).resolves.toBeNull();
    const afterErase = await request(app)
      .get(`/api/v1/participants/${fresh}`)
      .set(authorization(owner));

    expect(afterErase.status).toBe(404);
  });

  it('enforces event transitions, frozen scheduling and ticket coherence', async () => {
    const invalidTransition = await request(app)
      .post(`/api/v1/events/${draftEventId}/complete`)
      .set(authorization(owner));

    expect(invalidTransition.status).toBe(422);
    expect(invalidTransition.body.code).toBe('EVT_INVALID_TRANSITION');

    const frozen = await request(app)
      .patch(`/api/v1/events/${eventId}`)
      .set(authorization(owner))
      .send({ startAt: new Date(Date.now() + 86_400_000).toISOString() });

    expect(frozen.status).toBe(422);
    expect(frozen.body.code).toBe('EVT_FIELDS_FROZEN');

    const draftTicket = await request(app)
      .post(`/api/v1/events/${draftEventId}/tickets`)
      .set(authorization(owner))
      .send({ name: 'Draft ticket', priceAmount: '10.00' });

    expect(draftTicket.status).toBe(201);

    const participant = await createParticipant(owner.token, 'Ticketless');
    const mismatch = await request(app)
      .post('/api/v1/registrations')
      .set(authorization(owner))
      .send({
        eventId,
        participantId: participant,
        ticketId: draftTicket.body.data.id,
      });

    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe('REG_TICKET_EVENT_MISMATCH');

    const cancelled = await request(app)
      .post('/api/v1/registrations')
      .set(authorization(owner))
      .send({ eventId, participantId: participant, ticketId });
    const cancelledId = cancelled.body.data.id as string;

    await request(app)
      .post(`/api/v1/registrations/${cancelledId}/cancel`)
      .set(authorization(owner));

    const invalidRegistrationTransition = await request(app)
      .patch(`/api/v1/registrations/${cancelledId}`)
      .set(authorization(owner))
      .send({ status: 'CONFIRMED' });

    expect(invalidRegistrationTransition.status).toBe(422);
    expect(invalidRegistrationTransition.body.code).toBe('REG_INVALID_TRANSITION');

    const managerTicketUpdate = await request(app)
      .patch(`/api/v1/events/${eventId}/tickets/${ticketId}`)
      .set(authorization(manager))
      .send({ name: 'Standard updated' });

    expect(managerTicketUpdate.status).toBe(200);
    expect(managerTicketUpdate.body.data.name).toBe('Standard updated');
  });

  it('caps cumulative refunds and serializes concurrent check-ins', async () => {
    const transaction = await request(app)
      .post('/api/v1/transactions')
      .set(authorization(owner))
      .send({ eventId, type: 'TICKET', amount: '25.00', registrationId: registrationBId });
    const transactionId = transaction.body.data.id as string;

    await request(app)
      .patch(`/api/v1/transactions/${transactionId}`)
      .set(authorization(owner))
      .send({ status: 'PAID' });

    const partial = await request(app)
      .post(`/api/v1/transactions/${transactionId}/refunds`)
      .set(authorization(owner))
      .send({ amount: '20.00' });

    expect(partial.status).toBe(201);
    expect(partial.body.data.transaction.status).toBe('PARTIALLY_REFUNDED');

    const aboveCap = await request(app)
      .post(`/api/v1/transactions/${transactionId}/refunds`)
      .set(authorization(owner))
      .send({ amount: '10.00' });

    expect(aboveCap.status).toBe(422);
    expect(aboveCap.body.code).toBe('PAY_REFUND_EXCEEDS_AMOUNT');

    const exact = await request(app)
      .post(`/api/v1/transactions/${transactionId}/refunds`)
      .set(authorization(owner))
      .send({ amount: '5.00' });

    expect(exact.status).toBe(201);
    expect(exact.body.data.transaction.status).toBe('REFUNDED');

    const participant = await createParticipant(owner.token, 'Concurrent');
    const registrationId = await createConfirmedRegistration(participant, ticketId);
    const payload = { eventId, participantId: participant, registrationId };
    const [first, second] = await Promise.all([
      request(app).post('/api/v1/check-ins').set(authorization(owner)).send(payload),
      request(app).post('/api/v1/check-ins').set(authorization(owner)).send(payload),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);

    const validCheckIns = await client.checkIn.count({
      where: { eventId, participantId: participant, status: 'VALID' },
    });

    expect(validCheckIns).toBe(1);
  });
});
