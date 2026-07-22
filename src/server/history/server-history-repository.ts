import { openDatabase, type SqliteDatabase } from "@/server/database/database";
import { SqliteHistoryRepository } from "@/server/history/sqlite-history-repository";
import { SqliteDiscoveryStateRepository } from "@/server/discovery/sqlite-discovery-state-repository";

const globalDatabase = globalThis as typeof globalThis & { creatorHistoryDatabase?: SqliteDatabase };

export function getServerHistoryRepository(): SqliteHistoryRepository {
  globalDatabase.creatorHistoryDatabase ??= openDatabase();
  return new SqliteHistoryRepository(globalDatabase.creatorHistoryDatabase);
}

export function getServerDiscoveryStateRepository(): SqliteDiscoveryStateRepository {
  globalDatabase.creatorHistoryDatabase ??= openDatabase();
  return new SqliteDiscoveryStateRepository(globalDatabase.creatorHistoryDatabase);
}
