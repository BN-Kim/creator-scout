export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureOperationRuntime } = await import("@/server/operations/operation-runtime");
  ensureOperationRuntime();
}
