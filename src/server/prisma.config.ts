import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 configuration file.
 * Quản lý database URL cho migration và CLI commands.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --compiler-options {"rootDir":".","module":"commonjs"} prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
