import { describe, expect, it } from "vitest";
import { createInitialHistory, evaluateMockRun } from "@/lib/mock-run";
import { groupResults } from "@/server/output/group-results";

describe("result grouping", () => {
  it("places every creator in exactly one of three groups", () => {
    const creators = evaluateMockRun(createInitialHistory()); const groups = groupResults(creators);
    expect(Object.keys(groups)).toEqual(["recommended", "hold", "excluded"]);
    expect(groups.recommended.length + groups.hold.length + groups.excluded.length).toBe(creators.length);
    expect(new Set([...groups.recommended, ...groups.hold, ...groups.excluded].map((item) => item.identity.internalId)).size).toBe(creators.length);
  });
  it("hard exclusions never remain recommended or hold", () => {
    const groups = groupResults(evaluateMockRun(createInitialHistory()));
    expect([...groups.recommended, ...groups.hold].some((creator) => creator.reasonCodes.includes("company_email"))).toBe(false);
  });
});
