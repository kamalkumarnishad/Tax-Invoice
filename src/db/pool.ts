import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

/**
 * The connections to a hosted Postgres. The database may go to sleep, or be
 * restarted by its host, at any time, and both end the open connections.
 */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    // Per running copy of the app. The host's own pooler shares them out from there.
    max: 5,
    // Long enough for a sleeping database to wake up, short enough to fail with a message.
    connectionTimeoutMillis: 15_000,
    // Unused connections are closed well before the database sleeps, so few are ever found dead.
    idleTimeoutMillis: 5_000,
    query_timeout: 30_000,
    keepAlive: true,
  });
  // Without a listener, losing an unused connection would stop the whole server.
  // The pool has already dropped it, and opens a new one when it is needed.
  pool.on("error", (error) => console.warn("A database connection was lost:", error.message));
  // On Vercel, keeps a copy of the app awake until its unused connections are closed. Elsewhere does nothing.
  attachDatabasePool(pool);
  return pool;
}
