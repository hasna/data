#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb, closeDb } from "../db/sqlite.js";
import { closeNeo4j } from "../db/neo4j.js";
import { DEFAULT_VECTOR_CONFIG, DEFAULT_GRAPH_CONFIG } from "../types.js";
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
  deleteRecord,
  deleteRecordsByDataset,
  updateRecordData,
  countRecordsByStatus,
  ingestData,
  processPendingRecord,
  vectorSearch,
  graphSearch,
  hybridSearch,
  listEntities,
  listRelations,
  createEntity,
  createRelation,
  getEntity,
  getRelation,
  deleteEntity,
  deleteRelation,
  deleteEntitiesByDataset,
  extractGraphEntities,
  findGraphPaths,
  getEntityNeighbors,
  structureData,
  sanitizeData,
  vectorizeTexts,
  cosineSimilarity,
  textToSearchable,
} from "../services/index.js";

// Initialize DB on startup
initDb();

const server = new McpServer({
  name: "open-data",
  version: "0.1.0",
});

// --- Tenant tools ---

server.tool("create_tenant", "Create a new tenant", {
  name: z.string().describe("Tenant display name"),
  slug: z.string().describe("URL-safe unique slug"),
  type: z.enum(["personal", "organization", "team"]).optional().describe("Tenant type"),
}, async (params) => {
  const tenant = createTenant({
    name: params.name,
    slug: params.slug,
    type: params.type ?? "personal",
  });
  return { content: [{ type: "text", text: JSON.stringify(tenant, null, 2) }] };
});

server.tool("get_tenant", "Get tenant by ID", {
  id: z.string().describe("Tenant ID"),
}, async (params) => {
  const tenant = getTenant(params.id);
  if (!tenant) return { content: [{ type: "text", text: "Tenant not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(tenant, null, 2) }] };
});

server.tool("list_tenants", "List all tenants", {}, async () => {
  const tenants = listTenants();
  return { content: [{ type: "text", text: JSON.stringify(tenants, null, 2) }] };
});

server.tool("get_tenant_by_slug", "Get tenant by slug", {
  slug: z.string().describe("URL-safe tenant slug"),
}, async (params) => {
  const tenant = getTenantBySlug(params.slug);
  if (!tenant) return { content: [{ type: "text", text: "Tenant not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(tenant, null, 2) }] };
});

server.tool("update_tenant", "Update a tenant", {
  id: z.string().describe("Tenant ID"),
  name: z.string().optional().describe("New display name"),
  type: z.enum(["personal", "organization", "team"]).optional().describe("New tenant type"),
  settings: z.record(z.any()).optional().describe("Partial settings updates"),
}, async (params) => {
  const tenant = updateTenant(params.id, {
    name: params.name,
    type: params.type,
    settings: params.settings as any,
  });
  if (!tenant) return { content: [{ type: "text", text: "Tenant not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(tenant, null, 2) }] };
});

server.tool("delete_tenant", "Delete a tenant", {
  id: z.string().describe("Tenant ID"),
}, async (params) => {
  const ok = deleteTenant(params.id);
  return { content: [{ type: "text", text: ok ? "Deleted" : "Not found" }] };
});

// --- Dataset tools ---

server.tool("create_dataset", "Create a new dataset", {
  tenant_id: z.string().describe("Owner tenant ID"),
  name: z.string().describe("Dataset name"),
  description: z.string().optional().describe("Description"),
  source_type: z.enum(["session", "file", "api", "manual", "connector"]).optional().describe("Data source type"),
  vectors_enabled: z.boolean().optional().describe("Enable vector embeddings"),
  graph_enabled: z.boolean().optional().describe("Enable graph extraction"),
}, async (params) => {
  const dataset = createDataset({
    tenant_id: params.tenant_id,
    name: params.name,
    description: params.description,
    source_type: params.source_type,
    vector_config: params.vectors_enabled !== undefined ? { ...DEFAULT_VECTOR_CONFIG, enabled: params.vectors_enabled, auto_embed: params.vectors_enabled } : undefined,
    graph_config: params.graph_enabled !== undefined ? { ...DEFAULT_GRAPH_CONFIG, enabled: params.graph_enabled, auto_extract: params.graph_enabled } : undefined,
  });
  return { content: [{ type: "text", text: JSON.stringify(dataset, null, 2) }] };
});

server.tool("get_dataset", "Get dataset by ID", {
  id: z.string().describe("Dataset ID"),
}, async (params) => {
  const dataset = getDataset(params.id);
  if (!dataset) return { content: [{ type: "text", text: "Dataset not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(dataset, null, 2) }] };
});

server.tool("list_datasets", "List datasets for a tenant", {
  tenant_id: z.string().describe("Tenant ID"),
}, async (params) => {
  const datasets = listDatasets(params.tenant_id);
  return { content: [{ type: "text", text: JSON.stringify(datasets, null, 2) }] };
});

server.tool("update_dataset", "Update a dataset", {
  id: z.string().describe("Dataset ID"),
  name: z.string().optional().describe("New name"),
  description: z.string().optional().describe("New description"),
  vectors_enabled: z.boolean().optional().describe("Enable vector embeddings"),
  graph_enabled: z.boolean().optional().describe("Enable graph extraction"),
}, async (params) => {
  const dataset = updateDataset(params.id, {
    name: params.name,
    description: params.description,
    vector_config: params.vectors_enabled !== undefined ? { ...DEFAULT_VECTOR_CONFIG, enabled: params.vectors_enabled, auto_embed: params.vectors_enabled } : undefined,
    graph_config: params.graph_enabled !== undefined ? { ...DEFAULT_GRAPH_CONFIG, enabled: params.graph_enabled, auto_extract: params.graph_enabled } : undefined,
  });
  if (!dataset) return { content: [{ type: "text", text: "Dataset not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(dataset, null, 2) }] };
});

server.tool("delete_dataset", "Delete a dataset", {
  id: z.string().describe("Dataset ID"),
}, async (params) => {
  const ok = deleteDataset(params.id);
  return { content: [{ type: "text", text: ok ? "Deleted" : "Not found" }] };
});

// --- Record tools ---

server.tool("create_record", "Create a new record in a dataset", {
  dataset_id: z.string().describe("Dataset ID"),
  tenant_id: z.string().describe("Tenant ID"),
  data: z.any().describe("Record data (any JSON)"),
  raw_data: z.any().optional().describe("Original raw data before transformation"),
}, async (params) => {
  const record = createRecord(params.dataset_id, params.tenant_id, params.data, params.raw_data);
  return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
});

server.tool("get_record", "Get a record by ID", {
  id: z.string().describe("Record ID"),
}, async (params) => {
  const record = getRecord(params.id);
  if (!record) return { content: [{ type: "text", text: "Record not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
});

server.tool("list_records", "List records in a dataset", {
  dataset_id: z.string().describe("Dataset ID"),
  status: z.string().optional().describe("Filter by status"),
  limit: z.number().optional().describe("Max results"),
  offset: z.number().optional().describe("Offset"),
}, async (params) => {
  const records = listRecords(params.dataset_id, params.status, params.limit ?? 20, params.offset ?? 0);
  return { content: [{ type: "text", text: JSON.stringify(records, null, 2) }] };
});

server.tool("count_records", "Count records by status in a dataset", {
  dataset_id: z.string().describe("Dataset ID"),
}, async (params) => {
  const counts = countRecordsByStatus(params.dataset_id);
  return { content: [{ type: "text", text: JSON.stringify(counts, null, 2) }] };
});

server.tool("delete_record", "Delete a record", {
  id: z.string().describe("Record ID"),
}, async (params) => {
  const ok = deleteRecord(params.id);
  return { content: [{ type: "text", text: ok ? "Deleted" : "Not found" }] };
});

server.tool("update_record_status", "Update a record's processing status", {
  id: z.string().describe("Record ID"),
  status: z.enum(["pending", "structured", "sanitized", "vectorized", "graphed", "complete", "error"]).describe("New status"),
  error: z.string().optional().describe("Error message (if status is error)"),
}, async (params) => {
  const record = updateRecordStatus(params.id, params.status, params.error);
  if (!record) return { content: [{ type: "text", text: "Record not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
});

server.tool("update_record_data", "Update a record's data fields", {
  id: z.string().describe("Record ID"),
  data: z.any().describe("New data (any JSON)"),
}, async (params) => {
  const record = updateRecordData(params.id, params.data);
  if (!record) return { content: [{ type: "text", text: "Record not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
});

server.tool("delete_records_by_dataset", "Delete all records in a dataset", {
  dataset_id: z.string().describe("Dataset ID"),
}, async (params) => {
  const count = deleteRecordsByDataset(params.dataset_id);
  return { content: [{ type: "text", text: `Deleted ${count} records` }] };
});

// --- Ingest tool ---

server.tool("ingest_data", "Ingest data into a dataset (runs full pipeline if auto_process)", {
  tenant_id: z.string().describe("Tenant ID"),
  dataset_id: z.string().describe("Dataset ID"),
  data: z.any().describe("Data to ingest (any JSON)"),
  source: z.enum(["file", "session", "api", "manual"]).optional().describe("Source type"),
  auto_process: z.boolean().optional().describe("Auto-run full pipeline (default true)"),
}, async (params) => {
  const result = await ingestData({
    tenant_id: params.tenant_id,
    dataset_id: params.dataset_id,
    source: params.source ?? "api",
    data: params.data,
    auto_process: params.auto_process ?? true,
  });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

server.tool("process_record", "Process a pending record through the full pipeline", {
  record_id: z.string().describe("Record ID"),
}, async (params) => {
  const result = await processPendingRecord(params.record_id);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

// --- Search tools ---

server.tool("search", "Search indexed data (vector, graph, or hybrid)", {
  tenant_id: z.string().describe("Tenant ID"),
  query: z.string().describe("Search query"),
  datasets: z.array(z.string()).optional().describe("Dataset IDs to search"),
  search_type: z.enum(["vector", "graph", "hybrid"]).optional().describe("Search type (default: vector)"),
  limit: z.number().optional().describe("Max results"),
}, async (params) => {
  try {
    const result = await (params.search_type === "graph" ? graphSearch :
      params.search_type === "hybrid" ? hybridSearch : vectorSearch)({
      tenant_id: params.tenant_id,
      query: params.query,
      datasets: params.datasets,
      search_type: params.search_type ?? "vector",
      limit: params.limit ?? 10,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: JSON.stringify({ records: [], total: 0, latency_ms: 0, error: err.message ?? "Search failed" }, null, 2) }] };
  }
});

// --- Graph exploration tools ---

server.tool("list_entities", "List entities in a dataset", {
  dataset_id: z.string().describe("Dataset ID"),
  type: z.string().optional().describe("Filter by entity type"),
  limit: z.number().optional().describe("Max results"),
}, async (params) => {
  const entities = listEntities(params.dataset_id, params.type, params.limit ?? 50);
  return { content: [{ type: "text", text: JSON.stringify(entities, null, 2) }] };
});

server.tool("list_relations", "List relations in a dataset", {
  dataset_id: z.string().describe("Dataset ID"),
  limit: z.number().optional().describe("Max results"),
}, async (params) => {
  const relations = listRelations(params.dataset_id, params.limit ?? 50);
  return { content: [{ type: "text", text: JSON.stringify(relations, null, 2) }] };
});

server.tool("create_entity", "Create a new entity in the graph", {
  tenant_id: z.string().describe("Tenant ID"),
  dataset_id: z.string().describe("Dataset ID"),
  type: z.string().describe("Entity type (e.g. person, organization, concept)"),
  name: z.string().describe("Entity name"),
  properties: z.record(z.any()).optional().describe("Additional properties"),
}, async (params) => {
  const entity = createEntity(
    params.tenant_id,
    params.dataset_id,
    params.type,
    params.name,
    params.properties ?? {},
  );
  return { content: [{ type: "text", text: JSON.stringify(entity, null, 2) }] };
});

server.tool("create_relation", "Create a relation between two entities", {
  tenant_id: z.string().describe("Tenant ID"),
  type: z.string().describe("Relation type (e.g. works_for, related_to)"),
  source_entity_id: z.string().describe("Source entity ID"),
  target_entity_id: z.string().describe("Target entity ID"),
  weight: z.number().optional().describe("Relation weight (default 1.0)"),
  properties: z.record(z.any()).optional().describe("Additional properties"),
}, async (params) => {
  const relation = createRelation(
    params.tenant_id,
    params.type,
    params.source_entity_id,
    params.target_entity_id,
    params.weight ?? 1.0,
    params.properties ?? {},
  );
  return { content: [{ type: "text", text: JSON.stringify(relation, null, 2) }] };
});

server.tool("get_entity", "Get an entity by ID", {
  id: z.string().describe("Entity ID"),
}, async (params) => {
  const entity = getEntity(params.id);
  if (!entity) return { content: [{ type: "text", text: "Entity not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(entity, null, 2) }] };
});

server.tool("get_relation", "Get a relation by ID", {
  id: z.string().describe("Relation ID"),
}, async (params) => {
  const relation = getRelation(params.id);
  if (!relation) return { content: [{ type: "text", text: "Relation not found" }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(relation, null, 2) }] };
});

server.tool("delete_entity", "Delete an entity from the graph", {
  id: z.string().describe("Entity ID"),
}, async (params) => {
  const ok = deleteEntity(params.id);
  return { content: [{ type: "text", text: ok ? "Deleted" : "Not found" }] };
});

server.tool("delete_relation", "Delete a relation from the graph", {
  id: z.string().describe("Relation ID"),
}, async (params) => {
  const ok = deleteRelation(params.id);
  return { content: [{ type: "text", text: ok ? "Deleted" : "Not found" }] };
});

server.tool("find_graph_paths", "Find paths between two entities in the graph", {
  tenant_id: z.string().describe("Tenant ID"),
  start_type: z.string().describe("Start entity type"),
  start_name: z.string().describe("Start entity name"),
  end_type: z.string().describe("End entity type"),
  end_name: z.string().describe("End entity name"),
  max_depth: z.number().optional().describe("Max traversal depth"),
}, async (params) => {
  const paths = await findGraphPaths(
    params.tenant_id,
    params.start_type,
    params.start_name,
    params.end_type,
    params.end_name,
    params.max_depth ?? 5,
  );
  return { content: [{ type: "text", text: JSON.stringify(paths, null, 2) }] };
});

server.tool("get_entity_neighbors", "Get neighbors of an entity in the graph", {
  tenant_id: z.string().describe("Tenant ID"),
  entity_id: z.string().describe("Entity ID"),
  depth: z.number().optional().describe("Traversal depth"),
}, async (params) => {
  const neighbors = await getEntityNeighbors(
    params.tenant_id,
    params.entity_id,
    params.depth ?? 1,
  );
  return { content: [{ type: "text", text: JSON.stringify(neighbors, null, 2) }] };
});

server.tool("delete_entities_by_dataset", "Delete all entities and relations in a dataset", {
  dataset_id: z.string().describe("Dataset ID"),
}, async (params) => {
  const count = deleteEntitiesByDataset(params.dataset_id);
  return { content: [{ type: "text", text: `Deleted ${count} entities` }] };
});

server.tool("extract_graph_entities", "Extract entities and relations from data using AI", {
  data: z.any().describe("Data to extract from (any JSON)"),
  entity_types: z.array(z.string()).describe("Entity types to look for"),
  relation_types: z.array(z.string()).describe("Relation types to look for"),
  model: z.string().optional().describe("Model to use for extraction"),
}, async (params) => {
  try {
    const result = await extractGraphEntities({
      data: params.data as Record<string, unknown>,
      entity_types: params.entity_types,
      relation_types: params.relation_types,
      model: params.model,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: JSON.stringify({ entities: [], relations: [], error: err.message ?? "Extraction failed" }, null, 2) }] };
  }
});

// --- Vectorize tools ---

server.tool("vectorize_texts", "Convert text strings to vector embeddings", {
  texts: z.array(z.string()).describe("Text strings to vectorize"),
  model: z.string().optional().describe("Embedding model to use"),
}, async (params) => {
  try {
    const result = await vectorizeTexts({
      texts: params.texts,
      model: params.model,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: JSON.stringify({ embeddings: [], model: "", dimensions: 0, total_tokens: 0, error: err.message ?? "Vectorize failed" }, null, 2) }] };
  }
});

server.tool("cosine_similarity", "Calculate cosine similarity between two vectors", {
  a: z.array(z.number()).describe("First vector"),
  b: z.array(z.number()).describe("Second vector"),
}, async (params) => {
  const sim = cosineSimilarity(params.a, params.b);
  return { content: [{ type: "text", text: JSON.stringify({ similarity: sim }, null, 2) }] };
});

server.tool("text_to_searchable", "Convert a data object into a searchable string", {
  data: z.any().describe("Object to convert"),
}, async (params) => {
  const text = textToSearchable(params.data as Record<string, unknown>);
  return { content: [{ type: "text", text: text }] };
});

// --- Structure / Sanitize tools ---

server.tool("structure_data", "Extract structured fields from raw data using a dataset schema", {
  raw_data: z.any().describe("Raw data to structure (any JSON)"),
  dataset_schema: z.any().describe("Dataset schema definition"),
  model: z.string().optional().describe("Model to use for extraction"),
}, async (params) => {
  try {
    const result = await structureData({
      raw_data: params.raw_data,
      dataset_schema: params.dataset_schema,
      model: params.model,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: JSON.stringify({ structured: {}, confidence: 0, fields_extracted: [], fields_missing: [], error: err.message ?? "Structure failed" }, null, 2) }] };
  }
});

server.tool("sanitize_data", "Clean and validate structured data against a schema", {
  data: z.any().describe("Data to sanitize (any JSON)"),
  dataset_schema: z.any().describe("Dataset schema definition"),
  remove_pii: z.boolean().optional().describe("Remove PII (default true)"),
  model: z.string().optional().describe("Model to use for sanitization"),
}, async (params) => {
  try {
    const result = await sanitizeData({
      data: params.data,
      dataset_schema: params.dataset_schema,
      remove_pii: params.remove_pii ?? true,
      model: params.model,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: JSON.stringify({ sanitized: params.data, pii_removed: [], duplicates_found: 0, validation_errors: [err.message ?? "Sanitize failed"] }, null, 2) }] };
  }
});

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    closeDb();
    await closeNeo4j();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    closeDb();
    await closeNeo4j();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
