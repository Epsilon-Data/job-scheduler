import fs from "fs";
import { randomBytes } from "crypto";
import pg from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string | null;
  }
}

async function runSql(connectionString: string, statements: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(statements);
  } finally {
    await client.end();
  }
}

/**
 * Creates a throwaway database from TEST_DATABASE_URL (an admin URL) for this run and drops it afterwards.
 * The schema is the post-migration contract (coordinator revisions up to the output-files one), triggers included.
 */
export default async function setup({ provide }: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    console.warn(
      "\nTEST_DATABASE_URL is not set: database tests are skipped. " +
        "Set it to an admin URL, e.g. TEST_DATABASE_URL=postgresql://postgres@localhost:55432/postgres\n",
    );
    provide("databaseUrl", null);
    return;
  }

  const name = `rg_rw_${randomBytes(6).toString("hex")}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${name}`;
  const dropDatabase = () => runSql(adminUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);

  await runSql(adminUrl, `CREATE DATABASE "${name}"`);
  try {
    await runSql(databaseUrl.toString(), fs.readFileSync(new URL("./fixtures/schema.sql", import.meta.url), "utf8"));
  } catch (error) {
    await dropDatabase();
    throw error;
  }

  provide("databaseUrl", databaseUrl.toString());
  return dropDatabase;
}
