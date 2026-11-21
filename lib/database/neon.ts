import "server-only";
import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | undefined;

export function getDatabase() {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) throw new Error("Database connection is not configured.");
  client = neon(connectionString);
  return client;
}
