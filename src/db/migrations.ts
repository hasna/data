import Database from "bun:sqlite";

const MIGRATIONS = [
  // Migration 1: Initial schema
  `
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'personal',
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      schema_def TEXT NOT NULL DEFAULT '{"fields":[],"strict":false}',
      source_type TEXT NOT NULL DEFAULT 'manual',
      vector_config TEXT NOT NULL DEFAULT '{"enabled":true,"model":"text-embedding-3-small","dimensions":1536,"auto_embed":true}',
      graph_config TEXT NOT NULL DEFAULT '{"enabled":true,"auto_extract":true,"entity_types":["person","concept","code_module","project","session","document"],"relation_types":["depends_on","authored","references","contains","related_to","mentions"]}',
      record_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_datasets_tenant ON datasets(tenant_id);

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL REFERENCES datasets(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      data TEXT NOT NULL DEFAULT '{}',
      raw_data TEXT,
      vector BLOB,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_records_dataset ON records(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_records_tenant ON records(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      dataset_id TEXT NOT NULL REFERENCES datasets(id),
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      properties TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_entities_tenant ON entities(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_entities_dataset ON entities(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      type TEXT NOT NULL,
      source_entity_id TEXT NOT NULL REFERENCES entities(id),
      target_entity_id TEXT NOT NULL REFERENCES entities(id),
      weight REAL NOT NULL DEFAULT 1.0,
      properties TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_relations_tenant ON relations(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_entity_id);
    CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_entity_id);

    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );

    INSERT INTO schema_version VALUES (1);
  `,
];

export function runMigrations(db: Database): void {
  let currentVersion: number | null = null;
  try {
    const row = db.query("SELECT version FROM schema_version").get() as { version: number } | null;
    currentVersion = row?.version ?? null;
  } catch {
    // Table doesn't exist yet — fresh database
  }

  const startAt = currentVersion ?? 0;

  for (let i = startAt; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
    if (i > 0 || !currentVersion) {
      db.query("INSERT OR REPLACE INTO schema_version (version) VALUES (?)").run(i + 1);
    }
  }
}
