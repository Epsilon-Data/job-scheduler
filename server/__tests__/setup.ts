import { inject } from "vitest";

// server/db.ts reads DATABASE_URL when it is first imported, so this runs before any test file loads.
// Without a throwaway database the database tests are skipped; the placeholder keeps db.ts loadable
// and stops dotenv from pointing it at the .env database
process.env.DATABASE_URL = inject("databaseUrl") ?? "postgresql://database-tests-skipped.invalid/none";
