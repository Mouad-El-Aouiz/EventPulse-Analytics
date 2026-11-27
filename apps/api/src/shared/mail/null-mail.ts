import { AppError } from '../../errors/app-error.js';
import type { MailPort } from '../ports/mail.port.js';

export const EMAIL_DELIVERY_UNAVAILABLE = 'AUTH_EMAIL_UNAVAILABLE';

export class NullMailPort implements MailPort {
  constructor(private readonly allowSilentDelivery: boolean) {}

  async assertAvailable(): Promise<void> {
    if (!this.allowSilentDelivery) {
      throw new AppError('No email provider is configured', {
        statusCode: 503,
        code: EMAIL_DELIVERY_UNAVAILABLE,
        publicDetail: 'Password-reset email delivery is temporarily unavailable.',
      });
    }
  }

  async sendPasswordReset(): Promise<void> {
    await this.assertAvailable();
  }

  async sendOrganizationInvitation(): Promise<void> {
    await this.assertAvailable();
  }
}
