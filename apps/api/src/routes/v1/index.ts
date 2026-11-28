import express, { type Router } from 'express';
import {
  createAuditLogModule,
  type AuditLogModule,
} from '../../modules/audit-logs/audit-log.module.js';
import { createAuthRouter } from '../../modules/auth/auth.module.js';
import {
  createCheckInsModule,
  type CheckInsModule,
} from '../../modules/check-ins/check-ins.module.js';
import { createEventsModule, type EventsModule } from '../../modules/events/events.module.js';
import {
  createOrganizationsModule,
  type OrganizationsModule,
} from '../../modules/organizations/organizations.module.js';
import {
  createParticipantsModule,
  type ParticipantsModule,
} from '../../modules/participants/participants.module.js';
import {
  createRegistrationsModule,
  type RegistrationsModule,
} from '../../modules/registrations/registrations.module.js';
import { createRefundsModule, type RefundsModule } from '../../modules/refunds/refunds.module.js';
import {
  createTransactionsModule,
  type TransactionsModule,
} from '../../modules/transactions/transactions.module.js';

export function createV1Router(): Router {
  const router = express.Router();
  let authRouter: Router | undefined;
  let organizationsModule: OrganizationsModule | undefined;
  let auditLogModule: AuditLogModule | undefined;
  let eventsModule: EventsModule | undefined;
  let participantsModule: ParticipantsModule | undefined;
  let registrationsModule: RegistrationsModule | undefined;
  let transactionsModule: TransactionsModule | undefined;
  let refundsModule: RefundsModule | undefined;
  let checkInsModule: CheckInsModule | undefined;

  // Modules own their Prisma resources and are initialized on first use so that
  // health checks and unrelated routes do not open database connections.
  router.use('/auth', (req, res, next) => {
    authRouter ??= createAuthRouter();
    authRouter(req, res, next);
  });

  router.use('/organizations', (req, res, next) => {
    organizationsModule ??= createOrganizationsModule();
    organizationsModule.organizationsRouter(req, res, next);
  });

  router.use('/invitations', (req, res, next) => {
    organizationsModule ??= createOrganizationsModule();
    organizationsModule.invitationsRouter(req, res, next);
  });

  router.use('/audit-logs', (req, res, next) => {
    auditLogModule ??= createAuditLogModule();
    auditLogModule.auditLogRouter(req, res, next);
  });

  router.use('/events', (req, res, next) => {
    eventsModule ??= createEventsModule();
    eventsModule.eventsRouter(req, res, next);
  });

  router.use('/participants', (req, res, next) => {
    participantsModule ??= createParticipantsModule();
    participantsModule.participantsRouter(req, res, next);
  });

  router.use('/registrations', (req, res, next) => {
    registrationsModule ??= createRegistrationsModule();
    registrationsModule.registrationsRouter(req, res, next);
  });

  router.use('/transactions', (req, res, next) => {
    transactionsModule ??= createTransactionsModule();
    transactionsModule.transactionsRouter(req, res, next);
  });

  router.use('/refunds', (req, res, next) => {
    refundsModule ??= createRefundsModule();
    refundsModule.refundsRouter(req, res, next);
  });

  router.use('/check-ins', (req, res, next) => {
    checkInsModule ??= createCheckInsModule();
    checkInsModule.checkInsRouter(req, res, next);
  });

  return router;
}
