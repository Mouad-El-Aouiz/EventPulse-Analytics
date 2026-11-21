import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
  constructor: vi.fn<(options: unknown) => void>(),
  connect: vi.fn<() => Promise<void>>(),
  disconnect: vi.fn<() => Promise<void>>(),
  queryRaw: vi.fn<(query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      prismaMocks.constructor(options);
    }

    $connect = prismaMocks.connect;
    $disconnect = prismaMocks.disconnect;
    $queryRaw = prismaMocks.queryRaw;
  },
}));

vi.mock('../../../src/config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://eventpulse:eventpulse@localhost:5432/eventpulse?schema=public',
    DATABASE_POOL_SIZE: 7,
  },
}));

type PrismaModule = typeof import('../../../src/database/prisma.js');

let prismaModule: PrismaModule;

beforeEach(async () => {
  vi.resetModules();
  prismaMocks.constructor.mockClear();
  prismaMocks.connect.mockReset().mockResolvedValue(undefined);
  prismaMocks.disconnect.mockReset().mockResolvedValue(undefined);
  prismaMocks.queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);

  prismaModule = await import('../../../src/database/prisma.js');
});

describe('Prisma client factory', () => {
  it('creates one reusable client with the configured pool size', () => {
    const firstClient = prismaModule.getPrismaClient();
    const secondClient = prismaModule.getPrismaClient();

    expect(firstClient).toBe(secondClient);
    expect(prismaMocks.constructor).toHaveBeenCalledTimes(1);
    expect(prismaMocks.constructor).toHaveBeenCalledWith({
      datasources: {
        db: {
          url: expect.stringContaining('connection_limit=7'),
        },
      },
    });
    expect(prismaMocks.constructor).toHaveBeenCalledWith({
      datasources: {
        db: {
          url: expect.stringContaining('schema=public'),
        },
      },
    });
  });

  it('delegates connection and disconnection to the singleton client', async () => {
    const database = prismaModule.createPrismaDatabase();

    await database.connect();
    await database.disconnect();

    expect(prismaMocks.connect).toHaveBeenCalledTimes(1);
    expect(prismaMocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it('propagates connection failures', async () => {
    const database = prismaModule.createPrismaDatabase();
    const failure = new Error('database unavailable');

    prismaMocks.connect.mockRejectedValueOnce(failure);

    await expect(database.connect()).rejects.toBe(failure);
  });

  it('checks the database connection with a minimal SQL query', async () => {
    await prismaModule.checkDatabaseConnection();

    expect(prismaMocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('propagates query failures', async () => {
    const failure = new Error('connection refused');

    prismaMocks.queryRaw.mockRejectedValueOnce(failure);

    await expect(prismaModule.checkDatabaseConnection()).rejects.toBe(failure);
  });
});
