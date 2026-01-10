import { drizzle } from 'drizzle-orm/libsql';
import * as schema from "./schema";

const db = drizzle({
    connection: {
        url: Bun.env.TURSO_DATABASE_URL!,
        authToken: Bun.env.TURSO_AUTH_TOKEN!
    },
    schema,
});

export { db };