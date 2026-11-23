export async function register() {
  // Importing it validates the environment, so a missing secret stops the server at start-up.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("@/config/env");
}
