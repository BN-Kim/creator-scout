import { describe, expect, it } from "vitest";
import { parseYouTubeJsVideoCollection } from "@/server/providers/youtube/youtubejs-video-normalization";

describe("YouTube.js LockupView video normalization", () => {
  it.each([
    ["VIDEO", "fictional-lockup-video"],
    ["SHORT", "fictional-lockup-short"],
  ] as const)("reads %s LockupView content_id as a video identifier", (contentType, contentId) => {
    const result = parseYouTubeJsVideoCollection({
      videos: [{ type: "LockupView", content_type: contentType, content_id: contentId, title: { text: "허구 영상" } }],
    });
    expect(result).toMatchObject({ state: "available", videos: [{ videoId: contentId, title: "허구 영상" }] });
  });

  it("ignores CHANNEL and PLAYLIST LockupView nodes", () => {
    const result = parseYouTubeJsVideoCollection({ videos: [
      { type: "LockupView", content_type: "CHANNEL", content_id: "fictional-channel" },
      { type: "LockupView", content_type: "PLAYLIST", content_id: "fictional-playlist" },
    ] });
    expect(result).toEqual({ state: "confirmed_empty", videos: [] });
  });

  it("normalizes mixed legacy and LockupView identifier fields without reading non-video content_id", () => {
    const result = parseYouTubeJsVideoCollection({ videos: [
      { video_id: "fictional-video-id" },
      { id: "fictional-id" },
      { content_type: "VIDEO", content_id: "fictional-content-video" },
      { content_type: "SHORT", content_id: "fictional-content-short" },
      { content_type: "CHANNEL", content_id: "fictional-channel" },
    ] });
    expect(result.state).toBe("available");
    expect(result.videos.map((video) => video.videoId)).toEqual([
      "fictional-video-id", "fictional-id", "fictional-content-video", "fictional-content-short",
    ]);
  });

  it("never turns a real non-empty LockupView video list into zero", () => {
    const result = parseYouTubeJsVideoCollection({ videos: [
      { type: "LockupView", content_type: "VIDEO", content_id: "fictional-real-card" },
    ] });
    expect(result.state).toBe("available");
    expect(result.videos).toHaveLength(1);
  });

  it("distinguishes confirmed empty, unavailable, unsupported, and malformed collections", () => {
    expect(parseYouTubeJsVideoCollection({ videos: [] }).state).toBe("confirmed_empty");
    expect(parseYouTubeJsVideoCollection({ videos: null }).state).toBe("unavailable");
    expect(parseYouTubeJsVideoCollection({ changed_shape: [] }).state).toBe("unsupported");
    expect(parseYouTubeJsVideoCollection({ videos: "not-an-array" }).state).toBe("malformed");
    expect(parseYouTubeJsVideoCollection({ videos: [{ content_type: "VIDEO" }] }).state).toBe("malformed");
  });
});
