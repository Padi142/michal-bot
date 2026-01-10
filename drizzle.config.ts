import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: './drizzle',
    schema: './src/db/schema.ts',
    dialect: 'turso',
    dbCredentials: {
        url: Bun.env.TURSO_DATABASE_URL!,
        authToken: Bun.env.TURSO_AUTH_TOKEN!,
    },
});
