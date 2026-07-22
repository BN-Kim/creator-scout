import { describe, expect, it, vi } from "vitest";
import { HISTORY_STORAGE_KEY } from "@/lib/browser-history-repository";
import { HISTORY_MIGRATION_MARKER_KEY, migrateBrowserHistory } from "@/lib/history-api-client";
import { createInitialHistory } from "@/lib/mock-run";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => { values.set(key, value); },
    removeItem: (key: string): void => { values.delete(key); },
  };
}

describe("browser history server transition", () => {
  it("uploads current v2 records once and removes the local source only after success", async () => {
    const records = createInitialHistory();
    const storage = memoryStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(records) });
    const migrateBrowserRecords = vi.fn(async () => records);
    await migrateBrowserHistory(storage, { migrateBrowserRecords });
    await migrateBrowserHistory(storage, { migrateBrowserRecords });
    expect(migrateBrowserRecords).toHaveBeenCalledTimes(1);
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(HISTORY_MIGRATION_MARKER_KEY)).toBe("completed");
  });

  it("keeps local data when server migration fails", async () => {
    const serialized = JSON.stringify(createInitialHistory());
    const storage = memoryStorage({ [HISTORY_STORAGE_KEY]: serialized });
    await expect(migrateBrowserHistory(storage, { migrateBrowserRecords: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(serialized);
    expect(storage.getItem(HISTORY_MIGRATION_MARKER_KEY)).toBeNull();
  });
});
