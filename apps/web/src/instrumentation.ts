// Runs once when the server starts. Expired replays must go on time even if
// nobody uploads: uploads used to be the only thing that cleaned them.
const SWEEP_MS = 3600_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { deleteExpired } = await import("@/lib/replays");
  const sweep = () => deleteExpired().catch((err) => console.error("could not delete expired replays", err));
  void sweep();
  setInterval(sweep, SWEEP_MS).unref();
}
