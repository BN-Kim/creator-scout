import { openDatabase, type SqliteDatabase } from "@/server/database/database";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";

const globalDatabase = globalThis as typeof globalThis & { creatorHistoryDatabase?: SqliteDatabase };

export function getServerHistoryRepository(): SqliteHistoryRepository {
  globalDatabase.creatorHistoryDatabase ??= openDatabase();
  return new SqliteHistoryRepository(globalDatabase.creatorHistoryDatabase);
}
