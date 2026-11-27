import "server-only";
import { neon } from "@neondatabase/serverless";

type NeonHttpClient = ReturnType<typeof neon<false, false>>;
let client: NeonHttpClient | undefined;

export function getDatabase(): NeonHttpClient {
  if (client) return client;
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) throw new Error("Database connection is not configured.");
  client = neon(connectionString, { fullResults: false });
  return client;
}
