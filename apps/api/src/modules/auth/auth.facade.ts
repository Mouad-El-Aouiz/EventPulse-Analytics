import type {
  AuthUserProvisioner,
  AuthUserSummary,
} from '../../shared/contracts/auth-user-provisioner.js';
import type { UserRepository } from './repositories/user.repository.js';

export class AuthFacade implements AuthUserProvisioner {
  constructor(private readonly users: UserRepository) {}

  async getUser(userId: string): Promise<AuthUserSummary | null> {
    const user = await this.users.findById(userId);

    if (user === null) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isActive: user.isActive,
    };
  }
}
