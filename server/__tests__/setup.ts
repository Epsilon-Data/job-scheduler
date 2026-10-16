import { inject } from "vitest";

// server/db.ts reads DATABASE_URL when it is first imported, so this runs before any test file loads
const databaseUrl = inject("databaseUrl");
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}
