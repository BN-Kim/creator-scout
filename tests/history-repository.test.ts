import { describe, expect, it } from "vitest";
import { BrowserHistoryRepository } from "@/lib/browser-history-repository";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";
import { createHistoryRecord } from "@/server/history/history-record";

function storage() { let value: string | null = null; return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } }; }
describe("browser history repository", () => {
  it("maps decisions and prevents duplicate records", () => { const repository = new BrowserHistoryRepository(storage()); const creators = evaluateMockRun(createInitialHistory()); for (const creator of creators.slice(0, 3)) repository.addOrUpdate(createHistoryRecord(creator, "run")); expect(repository.load().map((record) => record.historyStatus)).toEqual(["recommended", "candidate", "candidate"]); repository.addOrUpdate(createHistoryRecord(creators[0], "run")); expect(repository.load()).toHaveLength(3); });
  it("updates unresolved identity with stronger evidence", () => { const repository = new BrowserHistoryRepository(storage()); const creator = evaluateMockRun(createInitialHistory())[0]; const weak = createHistoryRecord({ ...creator, identity: { ...creator.identity, youtubeChannelId: null } }, "run"); repository.addOrUpdate(weak); repository.addOrUpdate(createHistoryRecord(creator, "run")); expect(repository.load()[0].identity.youtubeChannelId).toBe(creator.identity.youtubeChannelId); });
});
