// Runs once when the server starts. Expired replays must go on time even if
// nobody uploads: uploads used to be the only thing that cleaned them.
const SWEEP_MS = 3600_000;

export async function register() {
  // This exact `if` lets the bundler drop the database imports from the edge
  // build, where `pg` can't compile. An early return doesn't.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { deleteExpired } = await import("@/lib/replays");
    const { deleteStaleAccountData } = await import("@/lib/notifications");
    const { deleteStaleMatches } = await import("@/lib/matches");
    const sweep = () =>
      Promise.all([deleteExpired(), deleteStaleAccountData(), deleteStaleMatches()]).catch((err) => console.error("could not delete expired data", err));
    void sweep();
    setInterval(sweep, SWEEP_MS).unref();
  }
}
