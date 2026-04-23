import { getDb } from "../db/sqlite.js";
import { runCypher } from "../db/neo4j.js";
import { vectorizeSingle, cosineSimilarity, textToSearchable } from "./vectorize.js";
import { findEntityByName, getEntity, listEntities } from "./graph.js";
import {
  SearchRequest,
  SearchResult,
  SearchResultRecord,
  GraphPath,
  DataRecord,
  Entity,
  Relation,
} from "../types.js";

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

// --- Vector Search ---

export async function vectorSearch(request: SearchRequest): Promise<SearchResult> {
  const start = Date.now();
  const db = getDb();

  let queryVector: number[];
  try {
    queryVector = await vectorizeSingle(request.query);
  } catch {
    return {
      records: [],
      total: 0,
      latency_ms: Date.now() - start,
      error: "Vectorization failed — vector search unavailable",
    };
  }

  const limit = request.limit || 10;

  // Fetch candidate records with vectors
  let sql = `SELECT * FROM records WHERE tenant_id = ? AND status IN ('vectorized', 'complete') AND vector IS NOT NULL`;
  const params: any[] = [request.tenant_id];

  if (request.datasets && request.datasets.length > 0) {
    const placeholders = request.datasets.map(() => "?").join(",");
    sql += ` AND dataset_id IN (${placeholders})`;
    params.push(...request.datasets);
  }

  if (request.filters?.date_from) {
    sql += ` AND created_at >= ?`;
    params.push(request.filters.date_from);
  }
  if (request.filters?.date_to) {
    sql += ` AND created_at <= ?`;
    params.push(request.filters.date_to);
  }

  sql += ` LIMIT 500`;

  const rows = db.query(sql).all(...params) as any[];
  const records = rows.map(rowToRecord).filter((r) => r.vector);

  // Score by cosine similarity
  const scored: SearchResultRecord[] = records
    .map((record) => ({
      record,
      score: cosineSimilarity(queryVector, record.vector!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    records: scored,
    total: scored.length,
    latency_ms: Date.now() - start,
  };
}

// --- Graph Search ---

export async function graphSearch(request: SearchRequest): Promise<SearchResult> {
  const start = Date.now();
  const db = getDb();
  const limit = request.limit || 10;

  // Use Neo4j fulltext or direct Cypher query
  // For now, search entities by name similarity in SQLite then expand via Neo4j
  const entityTypes = request.filters?.entity_types;
  let entitySql = `SELECT * FROM entities WHERE tenant_id = ? AND name LIKE ?`;
  const entityParams: any[] = [request.tenant_id, `%${request.query}%`];

  if (entityTypes && entityTypes.length > 0) {
    const placeholders = entityTypes.map(() => "?").join(",");
    entitySql += ` AND type IN (${placeholders})`;
    entityParams.push(...entityTypes);
  }

  if (request.datasets && request.datasets.length > 0) {
    const placeholders = request.datasets.map(() => "?").join(",");
    entitySql += ` AND dataset_id IN (${placeholders})`;
    entityParams.push(...request.datasets);
  }

  entitySql += ` LIMIT ?`;
  entityParams.push(limit);

  const entityRows = db.query(entitySql).all(...entityParams) as any[];

  // For each matching entity, get related records and graph paths
  const graphPaths: GraphPath[] = [];
  const recordIds = new Set<string>();

  for (const entityRow of entityRows) {
    const entityId = entityRow.id;

    // Get relations involving this entity
    const relRows = db.query(
      `SELECT r.* FROM relations r WHERE r.source_entity_id = ? OR r.target_entity_id = ?`
    ).all(entityId, entityId) as any[];

    const nodeIds = new Set<string>([entityId]);
    const edges: Relation[] = [];
    const nodes: Entity[] = [];

    for (const relRow of relRows) {
      nodeIds.add(relRow.source_entity_id);
      nodeIds.add(relRow.target_entity_id);
      edges.push({
        id: relRow.id,
        tenant_id: relRow.tenant_id,
        type: relRow.type,
        source_entity_id: relRow.source_entity_id,
        target_entity_id: relRow.target_entity_id,
        weight: relRow.weight,
        properties: JSON.parse(relRow.properties),
        created_at: relRow.created_at,
      });
    }

    // Resolve nodes
    for (const nid of nodeIds) {
      const node = getEntity(nid);
      if (node) {
        nodes.push(node);
        // Get records for this entity's dataset
        const recRows = db.query(
          `SELECT * FROM records WHERE dataset_id = ? AND tenant_id = ? AND status IN ('complete', 'graphed') LIMIT 5`
        ).all(node.dataset_id, request.tenant_id) as any[];
        for (const r of recRows) recordIds.add(r.id);
      }
    }

    if (nodes.length > 0) {
      const totalWeight = edges.reduce((sum, e) => sum + e.weight, 0);
      graphPaths.push({ nodes, edges, total_weight: totalWeight });
    }
  }

  // Fetch matching records
  let searchResultRecords: SearchResultRecord[] = [];
  if (recordIds.size > 0) {
    const placeholders = Array.from(recordIds).map(() => "?").join(",");
    const recRows = db.query(`SELECT * FROM records WHERE id IN (${placeholders})`).all(...Array.from(recordIds)) as any[];
    searchResultRecords = recRows.map(rowToRecord).map((record) => ({
      record,
      score: 1.0,
    }));
  }

  return {
    records: searchResultRecords.slice(0, limit),
    graph_paths: graphPaths,
    total: searchResultRecords.length,
    latency_ms: Date.now() - start,
  };
}

// --- Hybrid Search ---

export function mergeSearchResults(vectorResult: SearchResult, graphResult: SearchResult, limit: number): SearchResultRecord[] {
  const recordMap = new Map<string, SearchResultRecord>();

  for (const sr of vectorResult.records) {
    const existing = recordMap.get(sr.record.id);
    if (existing) {
      existing.score = Math.max(existing.score, sr.score);
    } else {
      recordMap.set(sr.record.id, { ...sr });
    }
  }

  for (const sr of graphResult.records) {
    const existing = recordMap.get(sr.record.id);
    if (existing) {
      existing.score = Math.max(existing.score, sr.score + 0.1); // small boost for graph match
    } else {
      recordMap.set(sr.record.id, { ...sr, score: sr.score + 0.1 });
    }
  }

  return Array.from(recordMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function hybridSearch(request: SearchRequest): Promise<SearchResult> {
  const start = Date.now();
  const limit = request.limit || 10;

  const [vectorResult, graphResult] = await Promise.all([
    vectorSearch(request),
    graphSearch(request),
  ]);

  const merged = mergeSearchResults(vectorResult, graphResult, limit);

  // Merge graph paths
  const graphPaths = [...(graphResult.graph_paths || [])];

  return {
    records: merged,
    graph_paths: graphPaths.length > 0 ? graphPaths : undefined,
    total: merged.length,
    latency_ms: Date.now() - start,
  };
}

// --- Unified Search ---

export async function search(request: SearchRequest): Promise<SearchResult> {
  switch (request.search_type) {
    case "vector":
      return vectorSearch(request);
    case "graph":
      return graphSearch(request);
    case "hybrid":
      return hybridSearch(request);
    default:
      return vectorSearch(request);
  }
}
