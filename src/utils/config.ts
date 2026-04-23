import { DataConfig } from "../types.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DATA_DIR = join(homedir(), ".hasna", "data");

export function getConfig(): DataConfig {
  mkdirSync(DATA_DIR, { recursive: true });

  return {
    db_path: process.env.DATA_DB_PATH || join(DATA_DIR, "data.db"),
    neo4j_uri: process.env.NEO4J_URI || "bolt://localhost:7687",
    neo4j_user: process.env.NEO4J_USER || "neo4j",
    neo4j_password: process.env.NEO4J_PASSWORD || "",
    openai_api_key: process.env.OPENAI_API_KEY || "",
    openai_base_url: process.env.OPENAI_BASE_URL || "",
    port: parseInt(process.env.PORT || "4100", 10),
    log_level: (process.env.LOG_LEVEL as DataConfig["log_level"]) || "info",
  };
}

export function getDataDir(): string {
  mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}
