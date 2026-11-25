export interface AppErrorOptions extends ErrorOptions {
  statusCode: number;
  code: string;
  publicDetail?: string;
  isOperational?: boolean;
  retryAfterSeconds?: number;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly publicDetail?: string;
  readonly isOperational: boolean;
  readonly retryAfterSeconds?: number;

  constructor(message: string, options: AppErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });

    this.name = new.target.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.publicDetail = options.publicDetail;
    this.isOperational = options.isOperational ?? true;
    this.retryAfterSeconds = options.retryAfterSeconds;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
