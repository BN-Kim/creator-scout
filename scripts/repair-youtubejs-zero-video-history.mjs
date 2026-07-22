import Database from "better-sqlite3";
import { resolve } from "node:path";

const PARSER_FIX_CUTOFF = "2026-07-22T12:33:50.068Z";
const MINIMUM_VIDEO_REASON = "insufficient_recent_video_count";

const options = parseArguments(process.argv.slice(2));
if (options.innertubeRunIds.size === 0) {
  fail("최소 한 개의 --innertube-run-id가 필요합니다. 해당 실행이 youtubejs_innertube를 사용했음을 먼저 확인하세요.");
}
if (options.apply && options.confirmedChannelIds.size === 0) {
  fail("적용하려면 삭제를 승인한 채널마다 --confirm-channel-id를 지정해야 합니다.");
}

const databasePath = resolve(options.databasePath ?? process.env.HISTORY_DATABASE_PATH ?? ".data/creator-history.sqlite");
const database = new Database(databasePath, { readonly: !options.apply, fileMustExist: true });
database.pragma("foreign_keys = ON");

try {
  const candidates = findCandidates(database, options.innertubeRunIds);
  printReport(databasePath, candidates, options.apply);
  if (!options.apply) process.exitCode = 0;
  else applyConfirmedRepairs(database, candidates, options.confirmedChannelIds);
} finally {
  database.close();
}

function findCandidates(database, innertubeRunIds) {
  const placeholders = [...innertubeRunIds].map(() => "?").join(", ");
  const rows = database.prepare(`SELECT id, identity_json, reason_codes_json, evidence_summary,
    scouting_run_id, created_at, updated_at, final_decision
    FROM history_records WHERE scouting_run_id IN (${placeholders})
    ORDER BY created_at, id`).all(...innertubeRunIds);
  return rows.flatMap((row) => {
    const identity = parseJson(row.identity_json);
    const reasons = parseJson(row.reason_codes_json);
    if (!identity || !Array.isArray(reasons)) return [];
    const channelId = typeof identity.youtubeChannelId === "string" ? identity.youtubeChannelId : null;
    const channelName = typeof identity.channelName === "string" ? identity.channelName : null;
    const createdBeforeFix = typeof row.created_at === "string" && row.created_at < PARSER_FIX_CUTOFF;
    const confirmedZero = typeof row.evidence_summary === "string" && /최근 영상\s+0개(?:\s|·|$)/u.test(row.evidence_summary);
    if (!channelId || !channelName || row.final_decision !== "excluded" || !createdBeforeFix || !confirmedZero
      || !reasons.includes(MINIMUM_VIDEO_REASON) || !String(row.id).startsWith("history-youtube:")) return [];
    return [{
      recordId: row.id,
      channelId,
      channelName,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      runId: row.scouting_run_id,
      reasons,
    }];
  });
}

function applyConfirmedRepairs(database, candidates, confirmedChannelIds) {
  const selected = candidates.filter((candidate) => confirmedChannelIds.has(candidate.channelId));
  const unknown = [...confirmedChannelIds].filter((channelId) => !candidates.some((candidate) => candidate.channelId === channelId));
  if (unknown.length > 0) fail(`복구 후보가 아닌 채널 ID가 포함되었습니다: ${unknown.join(", ")}`);
  database.transaction(() => {
    const remove = database.prepare("DELETE FROM history_records WHERE id = ?");
    for (const candidate of selected) remove.run(candidate.recordId);
  }).immediate();
  console.log(`적용 완료: 확인된 오판 레코드 ${selected.length}개를 제거했습니다.`);
  for (const candidate of selected) {
    console.log(`재실행 대상: ${candidate.channelId} | ${candidate.channelName}`);
  }
}

function printReport(databasePath, candidates, applying) {
  console.log(`모드: ${applying ? "적용" : "DRY-RUN (변경 없음)"}`);
  console.log(`데이터베이스: ${databasePath}`);
  console.log(`파서 수정 기준 시각: ${PARSER_FIX_CUTOFF}`);
  console.log(`영향 후보: ${candidates.length}개`);
  for (const candidate of candidates) {
    console.log(`${candidate.channelId} | ${candidate.channelName} | ${candidate.createdAt} | ${candidate.reasons.join(",")} | ${candidate.runId}`);
  }
}

function parseArguments(args) {
  const result = {
    apply: false,
    databasePath: null,
    innertubeRunIds: new Set(),
    confirmedChannelIds: new Set(),
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") result.apply = true;
    else if (argument === "--database") result.databasePath = requiredValue(args, ++index, argument);
    else if (argument === "--innertube-run-id") result.innertubeRunIds.add(requiredValue(args, ++index, argument));
    else if (argument === "--confirm-channel-id") result.confirmedChannelIds.add(requiredValue(args, ++index, argument));
    else fail(`지원하지 않는 인수입니다: ${argument}`);
  }
  return result;
}

function requiredValue(args, index, argument) {
  const value = args[index];
  if (!value || value.startsWith("--")) fail(`${argument} 값이 필요합니다.`);
  return value;
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
