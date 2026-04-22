import { randomUUID } from "node:crypto";
import { getDb } from "../db/sqlite.js";
import { DataRecord } from "../types.js";

function rowToRecord(row: any): DataRecord {
  return {
    id: row.id,
    dataset_id: row.dataset_id,
    tenant_id: row.tenant_id,
    data: JSON.parse(row.data),
    raw_data: row.raw_data ? JSON.parse(row.raw_data) : undefined,
    vector: row.vector ? Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4)) : undefined,
    status: row.status,
    error: row.error ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createRecord(
  datasetId: string,
  tenantId: string,
  data: Record<string, unknown>,
  rawData?: unknown
): DataRecord {
  const db = getDb();
  const id = `rec_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  db.query(
    `INSERT INTO records (id, dataset_id, tenant_id, data, raw_data, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(id, datasetId, tenantId, JSON.stringify(data), rawData ? JSON.stringify(rawData) : null);

  return getRecord(id)!;
}

export function getRecord(id: string): DataRecord | null {
  const db = getDb();
  const row = db.query("SELECT * FROM records WHERE id = ?").get(id) as any;
  return row ? rowToRecord(row) : null;
}

export function listRecords(datasetId: string, status?: string, limit = 100, offset = 0): DataRecord[] {
  const db = getDb();
  if (status) {
    const rows = db.query("SELECT * FROM records WHERE dataset_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(datasetId, status, limit, offset) as any[];
    return rows.map(rowToRecord);
  }
  const rows = db.query("SELECT * FROM records WHERE dataset_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(datasetId, limit, offset) as any[];
  return rows.map(rowToRecord);
}

export function updateRecordStatus(id: string, status: string, error?: string): DataRecord | null {
  const db = getDb();
  db.query("UPDATE records SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, error ?? null, id);
  return getRecord(id);
}

export function updateRecordData(id: string, data: Record<string, unknown>): DataRecord | null {
  const db = getDb();
  db.query("UPDATE records SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(data), id);
  return getRecord(id);
}

export function updateRecordVector(id: string, vector: number[]): void {
  const db = getDb();
  const f32 = new Float32Array(vector);
  db.query("UPDATE records SET vector = ?, updated_at = datetime('now') WHERE id = ?")
    .run(Buffer.from(f32.buffer), id);
}

export function deleteRecord(id: string): boolean {
  const db = getDb();
  const result = db.query("DELETE FROM records WHERE id = ?").run(id);
  return result.changes > 0;
}

export function deleteRecordsByDataset(datasetId: string): number {
  const db = getDb();
  const result = db.query("DELETE FROM records WHERE dataset_id = ?").run(datasetId);
  return result.changes;
}

export function countRecordsByStatus(datasetId: string): Record<string, number> {
  const db = getDb();
  const rows = db.query("SELECT status, COUNT(*) as count FROM records WHERE dataset_id = ? GROUP BY status")
    .all(datasetId) as any[];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}
