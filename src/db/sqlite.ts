import Database from "bun:sqlite";
import { getConfig } from "../utils/config.js";
import { runMigrations } from "./migrations.js";

let dbInstance: Database | null = null;

export function getDb(): Database {
  if (dbInstance) return dbInstance;

  const config = getConfig();
  dbInstance = new Database(config.db_path, { create: true });
  dbInstance.exec("PRAGMA journal_mode=WAL");
  dbInstance.exec("PRAGMA foreign_keys=ON");
  runMigrations(dbInstance);
  return dbInstance;
}

export function initDb(): Database {
  return getDb();
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
