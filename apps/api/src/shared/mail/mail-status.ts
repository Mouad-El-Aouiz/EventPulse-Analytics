import { env } from '../../config/env.js';

export const MAIL_PROVIDER_NONE = 'none';
export const PASSWORD_RESET_EMAIL_DISABLED_REASON = 'no_provider_configured';

export interface PasswordResetEmailStatus {
  provider: typeof MAIL_PROVIDER_NONE;
  deliveryEnabled: false;
  reason: typeof PASSWORD_RESET_EMAIL_DISABLED_REASON;
  intentionalNoOpInDevelopment: boolean;
}

export function getPasswordResetEmailStatus(): PasswordResetEmailStatus {
  return {
    provider: MAIL_PROVIDER_NONE,
    deliveryEnabled: false,
    reason: PASSWORD_RESET_EMAIL_DISABLED_REASON,
    intentionalNoOpInDevelopment: env.NODE_ENV !== 'production',
  };
}
