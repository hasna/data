// @hasna/data/sdk — High-level SDK
// Convenience wrappers that auto-initialize DB and provide a simple API

import { initDb, closeDb, getDb } from "../db/sqlite.js";
import { closeNeo4j, checkNeo4jHealth } from "../db/neo4j.js";
import { getConfig } from "../utils/config.js";
import {
  createTenant,
  getTenant,
  getTenantBySlug,
  listTenants,
  updateTenant,
  deleteTenant,
} from "../services/tenant.js";
import {
  createDataset,
  getDataset,
  listDatasets,
  updateDataset,
  deleteDataset,
} from "../services/dataset.js";
import {
  createRecord,
  getRecord,
  listRecords,
  updateRecordStatus,
  updateRecordData,
  deleteRecord,
  deleteRecordsByDataset,
  countRecordsByStatus,
} from "../services/record.js";
import {
  ingestData,
  processPendingRecord,
} from "../services/indexing.js";
import {
  structureData,
  sanitizeData,
} from "../services/structure.js";
import {
  vectorizeTexts,
  cosineSimilarity,
  textToSearchable,
} from "../services/vectorize.js";
import {
  search,
  vectorSearch,
  graphSearch,
  hybridSearch,
} from "../services/search.js";
import {
  listEntities,
  listRelations,
  findGraphPaths,
  getEntityNeighbors,
  extractGraphEntities,
  createEntity,
  createRelation,
  deleteEntity,
  deleteRelation,
  getEntity,
  getRelation,
  deleteEntitiesByDataset,
} from "../services/graph.js";

let _initialized = false;

function ensureInit() {
  if (!_initialized) {
    initDb();
    _initialized = true;
  }
}

/**
 * Open Data SDK client
 *
 * ```ts
 * import { OpenData } from "@hasna/data/sdk";
 *
 * const client = new OpenData();
 * const tenant = client.tenants.create({ name: "My Org", slug: "my-org" });
 * const dataset = client.datasets.create({ tenant_id: tenant.id, name: "Notes" });
 * await client.ingest({ tenant_id: tenant.id, dataset_id: dataset.id, data: { text: "hello" } });
 * const results = await client.search({ tenant_id: tenant.id, query: "hello" });
 * ```
 */
export class OpenData {
  tenants = {
    create: (input: Parameters<typeof createTenant>[0]) => { ensureInit(); return createTenant(input); },
    get: (id: string) => { ensureInit(); return getTenant(id); },
    getBySlug: (slug: string) => { ensureInit(); return getTenantBySlug(slug); },
    list: () => { ensureInit(); return listTenants(); },
    update: (id: string, input: Parameters<typeof updateTenant>[1]) => { ensureInit(); return updateTenant(id, input); },
    delete: (id: string) => { ensureInit(); return deleteTenant(id); },
  };

  datasets = {
    create: (input: Parameters<typeof createDataset>[0]) => { ensureInit(); return createDataset(input); },
    get: (id: string) => { ensureInit(); return getDataset(id); },
    list: (tenantId: string) => { ensureInit(); return listDatasets(tenantId); },
    update: (id: string, input: Parameters<typeof updateDataset>[1]) => { ensureInit(); return updateDataset(id, input); },
    delete: (id: string) => { ensureInit(); return deleteDataset(id); },
  };

  records = {
    create: (datasetId: string, tenantId: string, data: Record<string, unknown>, rawData?: unknown) => { ensureInit(); return createRecord(datasetId, tenantId, data, rawData); },
    get: (id: string) => { ensureInit(); return getRecord(id); },
    list: (datasetId: string, status?: string, limit?: number, offset?: number) => { ensureInit(); return listRecords(datasetId, status, limit ?? 20, offset ?? 0); },
    count: (datasetId: string) => { ensureInit(); return countRecordsByStatus(datasetId); },
    updateStatus: (id: string, status: string, error?: string) => { ensureInit(); return updateRecordStatus(id, status, error); },
    updateData: (id: string, data: Record<string, unknown>) => { ensureInit(); return updateRecordData(id, data); },
    delete: (id: string) => { ensureInit(); return deleteRecord(id); },
    deleteByDataset: (datasetId: string) => { ensureInit(); return deleteRecordsByDataset(datasetId); },
  };

  async ingest(input: Parameters<typeof ingestData>[0]) {
    ensureInit();
    return ingestData(input);
  }

  async processRecord(recordId: string) {
    ensureInit();
    return processPendingRecord(recordId);
  }

  async search(input: Parameters<typeof search>[0]) {
    ensureInit();
    return search(input);
  }

  async vectorSearch(input: Parameters<typeof vectorSearch>[0]) {
    ensureInit();
    return vectorSearch(input);
  }

  async graphSearch(input: Parameters<typeof graphSearch>[0]) {
    ensureInit();
    return graphSearch(input);
  }

  async hybridSearch(input: Parameters<typeof hybridSearch>[0]) {
    ensureInit();
    return hybridSearch(input);
  }

  graph = {
    entities: (datasetId: string, type?: string, limit?: number) => { ensureInit(); return listEntities(datasetId, type, limit ?? 50); },
    relations: (datasetId: string, limit?: number) => { ensureInit(); return listRelations(datasetId, limit ?? 50); },
    createEntity: (tenantId: string, datasetId: string, type: string, name: string, properties?: Record<string, unknown>) => {
      ensureInit();
      return createEntity(tenantId, datasetId, type, name, properties ?? {});
    },
    createRelation: (tenantId: string, type: string, sourceEntityId: string, targetEntityId: string, weight?: number, properties?: Record<string, unknown>) => {
      ensureInit();
      return createRelation(tenantId, type, sourceEntityId, targetEntityId, weight ?? 1.0, properties ?? {});
    },
    getEntity: (id: string) => { ensureInit(); return getEntity(id); },
    getRelation: (id: string) => { ensureInit(); return getRelation(id); },
    deleteEntity: (id: string) => { ensureInit(); return deleteEntity(id); },
    deleteRelation: (id: string) => { ensureInit(); return deleteRelation(id); },
    paths: (tenantId: string, startType: string, startName: string, endType: string, endName: string, maxDepth?: number) => {
      ensureInit();
      return findGraphPaths(tenantId, startType, startName, endType, endName, maxDepth ?? 5);
    },
    neighbors: (tenantId: string, entityId: string, depth?: number) => {
      ensureInit();
      return getEntityNeighbors(tenantId, entityId, depth ?? 1);
    },
    deleteEntitiesByDataset: (datasetId: string) => { ensureInit(); return deleteEntitiesByDataset(datasetId); },
  };

  async extractEntities(input: Parameters<typeof extractGraphEntities>[0]) {
    ensureInit();
    return extractGraphEntities(input);
  }

  async structure(input: Parameters<typeof structureData>[0]) {
    ensureInit();
    return structureData(input);
  }

  async sanitize(input: Parameters<typeof sanitizeData>[0]) {
    ensureInit();
    return sanitizeData(input);
  }

  async vectorize(input: Parameters<typeof vectorizeTexts>[0]) {
    ensureInit();
    return vectorizeTexts(input);
  }

  vector = {
    cosineSimilarity: (a: number[], b: number[]) => cosineSimilarity(a, b),
    textToSearchable: (data: Record<string, unknown>) => textToSearchable(data),
  };

  async health() {
    const neo4j = await checkNeo4jHealth();
    const cfg = getConfig();
    return { neo4j: neo4j.ok ? "connected" as const : "unavailable" as const, openai: !!cfg.openai_api_key };
  }

  close() {
    closeDb();
    closeNeo4j();
    _initialized = false;
  }
}

// Re-export types for convenience
export type * from "../types.js";
