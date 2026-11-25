import { describe, expect, it } from 'vitest';
import { PasswordService } from '../../../src/modules/auth/services/password.service.js';

const PASSWORD = 'correct horse battery staple';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes passwords with Argon2id parameters', async () => {
    const passwordHash = await passwords.hash(PASSWORD);

    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(passwordHash).toContain('m=65536,t=3,p=1');
    expect(passwordHash).not.toContain(PASSWORD);
  });

  it('verifies a valid password', async () => {
    const passwordHash = await passwords.hash(PASSWORD);

    await expect(passwords.verify(passwordHash, PASSWORD)).resolves.toBe(true);
  });

  it('rejects an invalid password', async () => {
    const passwordHash = await passwords.hash(PASSWORD);

    await expect(passwords.verify(passwordHash, `${PASSWORD}!`)).resolves.toBe(false);
  });

  it('returns false rather than throwing for malformed hashes', async () => {
    await expect(passwords.verify('not-an-argon2-hash', PASSWORD)).resolves.toBe(false);
  });

  it('always fails against the dummy hash while still performing work', async () => {
    await expect(passwords.verifyAgainstDummyHash(PASSWORD)).resolves.toBe(false);
    await expect(passwords.verifyAgainstDummyHash(PASSWORD)).resolves.toBe(false);
  });
});
