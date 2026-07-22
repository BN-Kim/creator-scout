import { openDatabase, type SqliteDatabase } from "@/server/database/database";
import { SqliteOperationRepository } from "@/server/operations/sqlite-operation-repository";

const globalOperations = globalThis as typeof globalThis & { creatorOperationsDatabase?: SqliteDatabase };

export function getServerOperationRepository(): SqliteOperationRepository {
  globalOperations.creatorOperationsDatabase ??= openDatabase();
  return new SqliteOperationRepository(globalOperations.creatorOperationsDatabase);
}
