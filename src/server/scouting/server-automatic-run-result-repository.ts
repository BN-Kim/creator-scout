import { openDatabase, type SqliteDatabase } from "@/server/database/database";
import { SqliteAutomaticRunResultRepository } from "@/server/scouting/sqlite-automatic-run-result-repository";

const globalResults = globalThis as typeof globalThis & {
  creatorRunResultDatabase?: SqliteDatabase;
};

export function getServerAutomaticRunResultRepository(): SqliteAutomaticRunResultRepository {
  globalResults.creatorRunResultDatabase ??= openDatabase();
  return new SqliteAutomaticRunResultRepository(globalResults.creatorRunResultDatabase);
}
