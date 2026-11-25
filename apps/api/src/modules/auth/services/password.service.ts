import { argon2id, hash, verify } from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

const DUMMY_PASSWORD = 'dummy-password-used-for-timing-equalization';

export class PasswordService {
  private dummyHashPromise: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.hash(DUMMY_PASSWORD);
    return this.dummyHashPromise;
  }

  async verifyAgainstDummyHash(password: string): Promise<false> {
    await this.verify(await this.getDummyHash(), password);
    return false;
  }
}
