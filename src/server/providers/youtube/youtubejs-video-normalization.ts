export type YouTubeJsVideoCollectionState =
  | "available"
  | "confirmed_empty"
  | "unavailable"
  | "unsupported"
  | "malformed";

export interface ParsedYouTubeJsVideoCard {
  videoId: string;
  title: string | null;
  publishedAt: string | null;
  viewCountText: string | null;
  durationSeconds: number | null;
}

export interface ParsedYouTubeJsVideoCollection {
  state: YouTubeJsVideoCollectionState;
  videos: ParsedYouTubeJsVideoCard[];
}

const videoContentTypes = new Set(["VIDEO", "SHORT"]);
const knownNonVideoContentTypes = new Set(["CHANNEL", "PLAYLIST"]);

export function parseYouTubeJsVideoCollection(value: unknown): ParsedYouTubeJsVideoCollection {
  if (value === null || value === undefined) return { state: "unavailable", videos: [] };
  const record = asRecord(value);
  if (!record) return { state: "malformed", videos: [] };
  if (!Object.prototype.hasOwnProperty.call(record, "videos")) return { state: "unsupported", videos: [] };
  if (record.videos === null || record.videos === undefined) return { state: "unavailable", videos: [] };
  if (!Array.isArray(record.videos)) return { state: "malformed", videos: [] };
  if (record.videos.length === 0) return { state: "confirmed_empty", videos: [] };

  const videos = record.videos.flatMap(parseVideoCard);
  if (videos.length > 0) return { state: "available", videos };

  const classifications = record.videos.map(classifyUnparsedCard);
  if (classifications.every((classification) => classification === "known_non_video")) {
    return { state: "confirmed_empty", videos: [] };
  }
  return {
    state: classifications.some((classification) => classification === "malformed_video")
      ? "malformed"
      : "unsupported",
    videos: [],
  };
}

function parseVideoCard(value: unknown): ParsedYouTubeJsVideoCard[] {
  const record = asRecord(value);
  if (!record) return [];
  const contentType = readString(record, "content_type")?.toUpperCase() ?? null;
  if (contentType && !videoContentTypes.has(contentType)) return [];
  const videoId = readString(record, "video_id")
    ?? readString(record, "id")
    ?? (contentType && videoContentTypes.has(contentType) ? readString(record, "content_id") : null);
  if (!videoId) return [];
  const duration = asRecord(record.duration);
  return [{
    videoId,
    title: readText(record.title),
    publishedAt: exactPublishedValue(record.published),
    viewCountText: readText(record.view_count) ?? readText(record.views) ?? readText(record.short_view_count),
    durationSeconds: readFiniteNumber(duration, "seconds")
      ?? durationFromText(readText(record.length_text) ?? readText(record.duration)),
  }];
}

function classifyUnparsedCard(value: unknown): "known_non_video" | "malformed_video" | "unsupported" {
  const record = asRecord(value);
  if (!record) return "unsupported";
  const contentType = readString(record, "content_type")?.toUpperCase() ?? null;
  if (contentType && knownNonVideoContentTypes.has(contentType)) return "known_non_video";
  if (contentType && videoContentTypes.has(contentType)) return "malformed_video";
  return "unsupported";
}

function exactPublishedValue(value: unknown): string | null {
  const text = readText(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : null;
}

function durationFromText(value: string | null): number | null {
  if (!value || !/^\d{1,3}(?::\d{1,2}){1,2}$/.test(value)) return null;
  return value.split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
}

function readText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return readString(asRecord(value), "text");
}

function readString(record: Record<string, unknown> | null, property: string): string | null {
  const value = record?.[property];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFiniteNumber(record: Record<string, unknown> | null, property: string): number | null {
  const value = record?.[property];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}
