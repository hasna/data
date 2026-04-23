#!/usr/bin/env node
import { initDb, closeDb } from "../db/sqlite.js";
import { closeNeo4j, checkNeo4jHealth } from "../db/neo4j.js";
import { getConfig } from "../utils/config.js";
import {
  createTenant,
  getTenant,
  getTenantBySlug,
  listTenants,
  updateTenant,
  deleteTenant,
  createDataset,
  getDataset,
  listDatasets,
  updateDataset,
  deleteDataset,
  createRecord,
  getRecord,
  listRecords,
  updateRecordStatus,
  updateRecordData,
  deleteRecord,
  deleteRecordsByDataset,
  countRecordsByStatus,
  ingestData,
  processPendingRecord,
  vectorSearch,
  graphSearch,
  hybridSearch,
  search,
  listEntities,
  listRelations,
  deleteEntitiesByDataset,
  extractGraphEntities,
  findGraphPaths,
  findEntityByName,
  getEntityNeighbors,
  createEntity,
  createRelation,
  getEntity,
  getRelation,
  deleteEntity,
  deleteRelation,
  updateEntity,
  updateRelation,
  structureData,
  sanitizeData,
  vectorizeTexts,
  cosineSimilarity,
} from "../services/index.js";

initDb();

const config = getConfig();

// --- Helpers ---

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// --- Router ---

function matchRoute(url: string, method: string): ((req: Request) => Promise<Response>) | null {
  const path = new URL(url).pathname.replace(/\/+$/, "");

  // Health
  if (path === "/health" && method === "GET") {
    return async () => {
      const neo4j = await checkNeo4jHealth();
      return json({ status: "ok", neo4j: neo4j.ok ? "connected" : "unavailable", openai: !!config.openai_api_key });
    };
  }

  // --- Tenants ---
  if (path === "/api/tenants" && method === "GET") {
    return async () => json(listTenants());
  }
  if (path === "/api/tenants" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      const name = b.name as string;
      const slug = b.slug as string;
      if (!name || !slug) return error("name and slug are required");
      const tenant = createTenant({ name, slug, type: (b.type as any) ?? "personal", settings: b.settings as any });
      return json(tenant, 201);
    };
  }
  // Get tenant by slug (must be before /api/tenants/:id catch-all)
  if (path.startsWith("/api/tenants/slug/") && method === "GET") {
    const slug = path.split("/").pop()!;
    return async () => {
      const t = getTenantBySlug(slug);
      if (!t) return error("Tenant not found", 404);
      return json(t);
    };
  }
  if (path.startsWith("/api/tenants/") && method === "GET") {
    const id = path.split("/").pop()!;
    return async () => {
      const t = getTenant(id);
      if (!t) return error("Tenant not found", 404);
      return json(t);
    };
  }
  if (path.startsWith("/api/tenants/") && method === "PATCH") {
    const id = path.split("/").pop()!;
    return async (req) => {
      const b = await body(req);
      const t = updateTenant(id, b as any);
      if (!t) return error("Tenant not found", 404);
      return json(t);
    };
  }
  if (path.startsWith("/api/tenants/") && method === "DELETE") {
    const id = path.split("/").pop()!;
    return async () => {
      const ok = deleteTenant(id);
      return ok ? json({ deleted: true }) : error("Tenant not found", 404);
    };
  }

  // --- Datasets ---
  if (path === "/api/datasets" && method === "GET") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const tenantId = urlObj.searchParams.get("tenant_id");
      if (!tenantId) return error("tenant_id query param required");
      return json(listDatasets(tenantId));
    };
  }
  if (path === "/api/datasets" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.tenant_id || !b.name) return error("tenant_id and name are required");
      const ds = createDataset(b as any);
      return json(ds, 201);
    };
  }
  if (path.startsWith("/api/datasets/") && method === "GET") {
    const id = path.split("/").pop()!;
    return async () => {
      const ds = getDataset(id);
      if (!ds) return error("Dataset not found", 404);
      return json(ds);
    };
  }
  if (path.startsWith("/api/datasets/") && method === "PATCH") {
    const id = path.split("/").pop()!;
    return async (req) => {
      const b = await body(req);
      const ds = updateDataset(id, b as any);
      if (!ds) return error("Dataset not found", 404);
      return json(ds);
    };
  }
  if (path.startsWith("/api/datasets/") && method === "DELETE") {
    const id = path.split("/").pop()!;
    return async () => {
      const ok = deleteDataset(id);
      return ok ? json({ deleted: true }) : error("Dataset not found", 404);
    };
  }

  // --- Records ---
  // --- Records: Create ---
  if (path === "/api/records" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.dataset_id || !b.tenant_id || !b.data) return error("dataset_id, tenant_id, and data are required");
      const r = createRecord(b.dataset_id as string, b.tenant_id as string, b.data as Record<string, unknown>, b.raw_data as unknown);
      return json(r, 201);
    };
  }

  if (path === "/api/records" && method === "GET") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const datasetId = urlObj.searchParams.get("dataset_id");
      if (!datasetId) return error("dataset_id query param required");
      const status = urlObj.searchParams.get("status") ?? undefined;
      const limit = parseInt(urlObj.searchParams.get("limit") ?? "20", 10);
      const offset = parseInt(urlObj.searchParams.get("offset") ?? "0", 10);
      return json(listRecords(datasetId, status, limit, offset));
    };
  }
  // Records count — must come before /api/records/:id to avoid "count" being treated as an ID
  if (path === "/api/records/count" && method === "GET") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const datasetId = urlObj.searchParams.get("dataset_id");
      if (!datasetId) return error("dataset_id query param required");
      return json(countRecordsByStatus(datasetId));
    };
  }
  if (path.startsWith("/api/records/") && method === "GET") {
    const id = path.split("/").pop()!;
    return async () => {
      const r = getRecord(id);
      if (!r) return error("Record not found", 404);
      return json(r);
    };
  }
  if (path.startsWith("/api/records/") && path.endsWith("/process") && method === "POST") {
    const parts = path.split("/");
    const id = parts[parts.length - 2];
    return async () => {
      const result = await processPendingRecord(id);
      return json(result);
    };
  }
  if (path.startsWith("/api/records/") && method === "PATCH") {
    const id = path.split("/").pop()!;
    return async (req) => {
      const b = await body(req);
      if (!b.status) return error("status is required");
      const r = updateRecordStatus(id, b.status as string, b.error as string | undefined);
      if (!r) return error("Record not found", 404);
      return json(r);
    };
  }
  // --- Records: Delete all records by dataset (must be before /api/records/:id) ---
  if (path === "/api/records/dataset" && method === "DELETE") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const datasetId = urlObj.searchParams.get("dataset_id");
      if (!datasetId) return error("dataset_id query param required");
      const count = deleteRecordsByDataset(datasetId);
      return json({ deleted: true, count });
    };
  }

  // --- Records: Update record data ---
  if (path.startsWith("/api/records/") && path.endsWith("/data") && method === "PATCH") {
    const parts = path.split("/");
    const id = parts[parts.length - 2];
    return async (req) => {
      const b = await body(req);
      if (!b.data) return error("data is required");
      const r = updateRecordData(id, b.data as Record<string, unknown>);
      if (!r) return error("Record not found", 404);
      return json(r);
    };
  }

  if (path.startsWith("/api/records/") && method === "DELETE") {
    const id = path.split("/").pop()!;
    return async () => {
      const ok = deleteRecord(id);
      return ok ? json({ deleted: true }) : error("Record not found", 404);
    };
  }

  // --- Ingest ---
  if (path === "/api/ingest" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.tenant_id || !b.dataset_id || !b.data) return error("tenant_id, dataset_id, and data are required");
      const result = await ingestData({
        tenant_id: b.tenant_id as string,
        dataset_id: b.dataset_id as string,
        source: (b.source as any) ?? "api",
        data: b.data,
        auto_process: (b.auto_process as boolean) ?? true,
      });
      return json(result, 201);
    };
  }

  // --- Search ---
  if (path === "/api/search" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.tenant_id || !b.query) return error("tenant_id and query are required");
      try {
        const result = await search({
          tenant_id: b.tenant_id as string,
          query: b.query as string,
          datasets: b.datasets as string[] | undefined,
          search_type: (b.search_type as any) ?? "vector",
          filters: b.filters as any,
          limit: (b.limit as number) ?? 10,
        });
        return json(result);
      } catch (err: any) {
        return json({ records: [], total: 0, latency_ms: 0, error: err.message ?? "Search failed" });
      }
    };
  }

  // --- Search: Vector search (GET convenience endpoint) ---
  if (path === "/api/search/vector" && method === "GET") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const tenantId = urlObj.searchParams.get("tenant_id");
      const query = urlObj.searchParams.get("query");
      if (!tenantId || !query) return error("tenant_id and query are required");
      try {
        const result = await vectorSearch({
          tenant_id: tenantId,
          query,
          datasets: urlObj.searchParams.getAll("dataset"),
          limit: parseInt(urlObj.searchParams.get("limit") ?? "10", 10),
          search_type: "vector",
        });
        return json(result);
      } catch (err: any) {
        return json({ records: [], total: 0, latency_ms: 0, error: err.message ?? "Search failed" });
      }
    };
  }

  // --- Graph: Entities ---
  if (path === "/api/graph/entities" && method === "GET") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const datasetId = urlObj.searchParams.get("dataset_id");
      if (!datasetId) return error("dataset_id query param required");
      const type = urlObj.searchParams.get("type") ?? undefined;
      const limit = parseInt(urlObj.searchParams.get("limit") ?? "100", 10);
      const offset = parseInt(urlObj.searchParams.get("offset") ?? "0", 10);
      return json(listEntities(datasetId, type, limit, offset));
    };
  }

  // --- Graph: Create Entity ---
  if (path === "/api/graph/entities" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.tenant_id || !b.dataset_id || !b.type || !b.name) {
        return error("tenant_id, dataset_id, type, and name are required");
      }
      const entity = createEntity(
        b.tenant_id as string,
        b.dataset_id as string,
        b.type as string,
        b.name as string,
        (b.properties as Record<string, unknown>) ?? {},
      );
      return json(entity, 201);
    };
  }

  // --- Graph: Delete all entities by dataset (must be before get/delete by id) ---
  if (path === "/api/graph/entities/dataset" && method === "DELETE") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const datasetId = urlObj.searchParams.get("dataset_id");
      if (!datasetId) return error("dataset_id query param required");
      const count = await deleteEntitiesByDataset(datasetId);
      return json({ deleted: true, count });
    };
  }

  // --- Graph: Find Entity by Name ---
  if (path === "/api/graph/entities/find" && method === "GET") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const tenantId = urlObj.searchParams.get("tenant_id");
      const name = urlObj.searchParams.get("name");
      if (!tenantId || !name) return error("tenant_id and name are required");
      const type = urlObj.searchParams.get("type") ?? undefined;
      const entity = findEntityByName(tenantId, name, type);
      if (!entity) return error("Entity not found", 404);
      return json(entity);
    };
  }

  // --- Graph: Get Entity ---
  if (path.startsWith("/api/graph/entities/") && method === "GET") {
    const id = path.split("/").pop()!;
    return async () => {
      const entity = getEntity(id);
      if (!entity) return error("Entity not found", 404);
      return json(entity);
    };
  }

  // --- Graph: Delete Entity ---
  if (path.startsWith("/api/graph/entities/") && method === "DELETE") {
    const id = path.split("/").pop()!;
    return async () => {
      const ok = await deleteEntity(id);
      return ok ? json({ deleted: true }) : error("Entity not found", 404);
    };
  }

  // --- Graph: Update Entity ---
  if (path.startsWith("/api/graph/entities/") && method === "PATCH") {
    const id = path.split("/").pop()!;
    return async (req) => {
      const b = await body(req);
      const entity = updateEntity(id, b as any);
      if (!entity) return error("Entity not found", 404);
      return json(entity);
    };
  }

  // --- Graph: Relations ---
  if (path === "/api/graph/relations" && method === "GET") {
    return async (req) => {
      const urlObj = new URL(req.url);
      const datasetId = urlObj.searchParams.get("dataset_id");
      if (!datasetId) return error("dataset_id query param required");
      const limit = parseInt(urlObj.searchParams.get("limit") ?? "100", 10);
      const offset = parseInt(urlObj.searchParams.get("offset") ?? "0", 10);
      return json(listRelations(datasetId, limit, offset));
    };
  }

  // --- Graph: Create Relation ---
  if (path === "/api/graph/relations" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.tenant_id || !b.type || !b.source_entity_id || !b.target_entity_id) {
        return error("tenant_id, type, source_entity_id, and target_entity_id are required");
      }
      const relation = createRelation(
        b.tenant_id as string,
        b.type as string,
        b.source_entity_id as string,
        b.target_entity_id as string,
        (b.weight as number) ?? 1.0,
        (b.properties as Record<string, unknown>) ?? {},
      );
      return json(relation, 201);
    };
  }

  // --- Graph: Get Relation ---
  if (path.startsWith("/api/graph/relations/") && method === "GET") {
    const id = path.split("/").pop()!;
    return async () => {
      const relation = getRelation(id);
      if (!relation) return error("Relation not found", 404);
      return json(relation);
    };
  }

  // --- Graph: Delete Relation ---
  if (path.startsWith("/api/graph/relations/") && method === "DELETE") {
    const id = path.split("/").pop()!;
    return async () => {
      const ok = await deleteRelation(id);
      return ok ? json({ deleted: true }) : error("Relation not found", 404);
    };
  }

  // --- Graph: Update Relation ---
  if (path.startsWith("/api/graph/relations/") && method === "PATCH") {
    const id = path.split("/").pop()!;
    return async (req) => {
      const b = await body(req);
      const relation = updateRelation(id, b as any);
      if (!relation) return error("Relation not found", 404);
      return json(relation);
    };
  }

  // --- Graph: Paths ---
  if (path === "/api/graph/paths" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.tenant_id || !b.start_type || !b.start_name || !b.end_type || !b.end_name) {
        return error("tenant_id, start_type, start_name, end_type, end_name are required");
      }
      const paths = await findGraphPaths(
        b.tenant_id as string,
        b.start_type as string,
        b.start_name as string,
        b.end_type as string,
        b.end_name as string,
        (b.max_depth as number) ?? 5,
      );
      return json(paths);
    };
  }

  // --- Graph: Neighbors ---
  if (path === "/api/graph/neighbors" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.tenant_id || !b.entity_id) return error("tenant_id and entity_id are required");
      const neighbors = await getEntityNeighbors(
        b.tenant_id as string,
        b.entity_id as string,
        (b.depth as number) ?? 1,
      );
      return json(neighbors);
    };
  }

  // --- Graph: Extract entities ---
  if (path === "/api/graph/extract" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.data || !b.entity_types || !b.relation_types) {
        return error("data, entity_types, and relation_types are required");
      }
      const result = await extractGraphEntities({
        data: b.data as Record<string, unknown>,
        entity_types: b.entity_types as string[],
        relation_types: b.relation_types as string[],
        model: b.model as string | undefined,
      });
      return json(result);
    };
  }

  // --- Structure data ---
  if (path === "/api/structure" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.raw_data || !b.dataset_schema) return error("raw_data and dataset_schema are required");
      try {
        const result = await structureData({
          raw_data: b.raw_data as Record<string, unknown>,
          dataset_schema: b.dataset_schema as import("../types.js").DatasetSchema,
          model: b.model as string | undefined,
        });
        return json(result);
      } catch (err: any) {
        return json({ structured: {}, confidence: 0, fields_extracted: [], fields_missing: [], error: err.message ?? "Structure failed" }, 500);
      }
    };
  }

  // --- Sanitize data ---
  if (path === "/api/sanitize" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.data || !b.dataset_schema) return error("data and dataset_schema are required");
      try {
        const result = await sanitizeData({
          data: b.data as Record<string, unknown>,
          dataset_schema: b.dataset_schema as import("../types.js").DatasetSchema,
          remove_pii: (b.remove_pii as boolean) ?? true,
          model: b.model as string | undefined,
        });
        return json(result);
      } catch (err: any) {
        return json({ sanitized: b.data as Record<string, unknown>, pii_removed: [], duplicates_found: 0, validation_errors: [err.message ?? "Sanitize failed"] }, 500);
      }
    };
  }

  // --- Vectorize ---
  if (path === "/api/vectorize" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.texts || !Array.isArray(b.texts)) return error("texts array is required");
      try {
        const result = await vectorizeTexts({
          texts: b.texts as string[],
          model: b.model as string | undefined,
        });
        return json(result);
      } catch (err: any) {
        return json({ embeddings: [], model: "", dimensions: 0, total_tokens: 0, error: err.message ?? "Vectorize failed" }, 500);
      }
    };
  }

  // --- Cosine Similarity ---
  if (path === "/api/vectorize/similarity" && method === "POST") {
    return async (req) => {
      const b = await body(req);
      if (!b.a || !b.b) return error("a and b vectors are required");
      const sim = cosineSimilarity(b.a as number[], b.b as number[]);
      return json({ similarity: sim });
    };
  }

  return null;
}

// --- Server ---

const server = Bun.serve({
  port: config.port,
  async fetch(req) {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const handler = matchRoute(req.url, req.method);
    if (!handler) {
      return json({ error: "Not found" }, 404);
    }

    try {
      const response = await handler(req);
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    } catch (err: any) {
      return json({ error: err.message ?? "Internal server error" }, 500);
    }
  },
});

console.log(`Open Data API server running on http://localhost:${server.port}`);

// Graceful shutdown
process.on("SIGINT", () => {
  closeDb();
  closeNeo4j();
  process.exit(0);
});
process.on("SIGTERM", () => {
  closeDb();
  closeNeo4j();
  process.exit(0);
});
