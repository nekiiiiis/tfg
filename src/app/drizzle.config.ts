import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/persistence/schema/index.ts',
  out: './src/persistence/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://fieldx:fieldx_dev_password_change_me@localhost:5432/infinite_fieldx',
  },
  strict: true,
  verbose: true,
});
