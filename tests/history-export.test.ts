import { describe, expect, it } from "vitest";
import { createHistoryExport } from "@/lib/creators";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";
import { createHistoryRecord } from "@/server/history/history-record";

describe("history export", () => {
  it("preserves exactly the compatibility fields and allowed statuses", () => {
    const records = evaluateMockRun(createInitialHistory()).slice(0, 4).map((creator) => createHistoryRecord(creator, "test-run"));
    const exported = createHistoryExport(records);
    expect(Object.keys(exported[0])).toEqual(["channel_name", "url", "status"]);
    expect(exported.every((record) => ["recommended", "candidate", "excluded"].includes(record.status))).toBe(true);
  });
});
