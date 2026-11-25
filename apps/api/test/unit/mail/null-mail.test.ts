import { describe, expect, it } from 'vitest';
import { EMAIL_DELIVERY_UNAVAILABLE, NullMailPort } from '../../../src/shared/mail/null-mail.js';

describe('NullMailPort', () => {
  it('fails closed when silent delivery is disabled', async () => {
    const mail = new NullMailPort(false);

    await expect(mail.assertAvailable()).rejects.toMatchObject({
      code: EMAIL_DELIVERY_UNAVAILABLE,
      statusCode: 503,
    });
    await expect(mail.sendPasswordReset()).rejects.toMatchObject({
      code: EMAIL_DELIVERY_UNAVAILABLE,
    });
  });

  it('performs no network delivery when silent delivery is enabled', async () => {
    const mail = new NullMailPort(true);

    await expect(mail.assertAvailable()).resolves.toBeUndefined();
    await expect(mail.sendPasswordReset()).resolves.toBeUndefined();
  });
});
