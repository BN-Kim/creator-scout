import { describe, expect, it } from "vitest";
import { mockCreatorInputs } from "@/data/creators";
import { identitiesMatch } from "@/server/history/history-matcher";
import { classifyYoutubeUrl } from "@/server/history/url-classifier";

const base = mockCreatorInputs[0].identity;
describe("identity matching", () => {
  it("matches by channel id, canonical URL, handle, alias, and normalized exact name", () => {
    expect(identitiesMatch(base, { ...base, canonicalChannelUrl: null, youtubeHandle: null }).matchedBy).toBe("channel_id");
    expect(identitiesMatch({ ...base, youtubeChannelId: null }, { ...base, youtubeChannelId: null }).matchedBy).toBe("canonical_url");
    expect(identitiesMatch({ ...base, youtubeChannelId: null, canonicalChannelUrl: null }, { ...base, youtubeChannelId: null, canonicalChannelUrl: null }).matchedBy).toBe("handle");
    expect(identitiesMatch({ ...base, youtubeChannelId: null, canonicalChannelUrl: null, youtubeHandle: null, normalizedChannelName: "left", confirmedAliases: ["공통 별칭"] }, { ...base, youtubeChannelId: null, canonicalChannelUrl: null, youtubeHandle: null, normalizedChannelName: "right", confirmedAliases: ["공통 별칭"] }).matchedBy).toBe("alias");
    expect(identitiesMatch({ ...base, youtubeChannelId: null, canonicalChannelUrl: null, youtubeHandle: null, confirmedAliases: [] }, { ...base, youtubeChannelId: null, canonicalChannelUrl: null, youtubeHandle: null, confirmedAliases: [] }).matchedBy).toBe("normalized_name");
  });
  it("does not treat search or video URLs as channel identity", () => { expect(classifyYoutubeUrl("https://www.youtube.com/results?search_query=test")).toBe("search"); expect(classifyYoutubeUrl("https://www.youtube.com/watch?v=mock")).toBe("video"); const left = { ...base, youtubeChannelId: null, canonicalChannelUrl: "https://www.youtube.com/results?search_query=test", youtubeHandle: null, channelName: "왼쪽 이름", normalizedChannelName: "왼쪽이름", confirmedAliases: [] }; const right = { ...left, channelName: "오른쪽 이름", normalizedChannelName: "오른쪽이름" }; expect(identitiesMatch(left, right).matched).toBe(false); });
});
