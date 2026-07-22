import { describe, expect, it } from "vitest";
import { getStatusLabel } from "@/components/status-badge";

describe("three-decision labels", () => {
  it("exposes only the Korean recommendation decisions", () => {
    expect(["recommended", "hold", "excluded"].map((value) => getStatusLabel(value as "recommended" | "hold" | "excluded"))).toEqual(["추천", "보류", "제외"]);
  });
});
