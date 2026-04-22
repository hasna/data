import { randomUUID } from "node:crypto";
import { getDb } from "../db/sqlite.js";
import {
  Dataset,
  CreateDatasetInput,
  DatasetSchema,
  VectorConfig,
  GraphConfig,
  DEFAULT_VECTOR_CONFIG,
  DEFAULT_GRAPH_CONFIG,
} from "../types.js";

function rowToDataset(row: any): Dataset {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    description: row.description,
    schema: JSON.parse(row.schema_def),
    source_type: row.source_type,
    vector_config: JSON.parse(row.vector_config),
    graph_config: JSON.parse(row.graph_config),
    record_count: row.record_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createDataset(input: CreateDatasetInput): Dataset {
  const db = getDb();
  const id = `ds_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const schema: DatasetSchema = input.schema
    ? { fields: input.schema.fields || [], strict: input.schema.strict ?? false }
    : { fields: [], strict: false };

  const vector_config: VectorConfig = { ...DEFAULT_VECTOR_CONFIG, ...input.vector_config };
  const graph_config: GraphConfig = { ...DEFAULT_GRAPH_CONFIG, ...input.graph_config };

  db.query(
    `INSERT INTO datasets (id, tenant_id, name, description, schema_def, source_type, vector_config, graph_config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.tenant_id,
    input.name,
    input.description || "",
    JSON.stringify(schema),
    input.source_type || "manual",
    JSON.stringify(vector_config),
    JSON.stringify(graph_config)
  );

  return getDataset(id)!;
}

export function getDataset(id: string): Dataset | null {
  const db = getDb();
  const row = db.query("SELECT * FROM datasets WHERE id = ?").get(id) as any;
  return row ? rowToDataset(row) : null;
}

export function listDatasets(tenantId: string): Dataset[] {
  const db = getDb();
  const rows = db.query("SELECT * FROM datasets WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId) as any[];
  return rows.map(rowToDataset);
}

export function updateDataset(
  id: string,
  updates: Partial<Pick<Dataset, "name" | "description" | "schema" | "vector_config" | "graph_config">>
): Dataset | null {
  const db = getDb();
  const ds = getDataset(id);
  if (!ds) return null;

  const name = updates.name ?? ds.name;
  const description = updates.description ?? ds.description;
  const schema = updates.schema ?? ds.schema;
  const vector_config = updates.vector_config ? { ...ds.vector_config, ...updates.vector_config } : ds.vector_config;
  const graph_config = updates.graph_config ? { ...ds.graph_config, ...updates.graph_config } : ds.graph_config;

  db.query(
    `UPDATE datasets SET name = ?, description = ?, schema_def = ?, vector_config = ?, graph_config = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, description, JSON.stringify(schema), JSON.stringify(vector_config), JSON.stringify(graph_config), id);

  return getDataset(id);
}

export function deleteDataset(id: string): boolean {
  const db = getDb();
  // Delete related records, relations (via entities), and entities first
  db.query("DELETE FROM records WHERE dataset_id = ?").run(id);
  db.query("DELETE FROM relations WHERE source_entity_id IN (SELECT id FROM entities WHERE dataset_id = ?) OR target_entity_id IN (SELECT id FROM entities WHERE dataset_id = ?)").run(id, id);
  db.query("DELETE FROM entities WHERE dataset_id = ?").run(id);
  const result = db.query("DELETE FROM datasets WHERE id = ?").run(id);
  return result.changes > 0;
}

export function incrementRecordCount(id: string, count = 1): void {
  const db = getDb();
  db.query("UPDATE datasets SET record_count = record_count + ?, updated_at = datetime('now') WHERE id = ?").run(count, id);
}
