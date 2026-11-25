export interface PasswordResetMail {
  to: string;
  resetToken: string;
  expiresAt: Date;
}

export interface MailPort {
  assertAvailable(): Promise<void>;
  sendPasswordReset(input: PasswordResetMail): Promise<void>;
}
