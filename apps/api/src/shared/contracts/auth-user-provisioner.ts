export interface AuthUserSummary {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
}

export interface AuthUserProvisioner {
  getUser(userId: string): Promise<AuthUserSummary | null>;
}
