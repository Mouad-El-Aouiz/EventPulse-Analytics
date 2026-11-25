import express, { type Router } from 'express';
import { getPasswordResetEmailStatus } from '../shared/mail/mail-status.js';

export function createHealthRouter(): Router {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness reports deliberate capability gaps without making the process
  // unready for traffic: password-reset delivery is disabled by design when no
  // mail provider is configured.
  router.get('/ready', (_req, res) => {
    res.status(200).json({
      status: 'degraded',
      checks: {
        passwordResetEmail: getPasswordResetEmailStatus(),
      },
    });
  });

  return router;
}
