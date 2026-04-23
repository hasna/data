// @hasna/data — Library API
// Full re-export of all services, types, and utilities

// --- Types ---
export * from "./types.js";

// --- Services ---
export {
  // Tenant
  createTenant,
  getTenant,
  getTenantBySlug,
  listTenants,
  updateTenant,
  deleteTenant,
} from "./services/tenant.js";

export {
  // Dataset
  createDataset,
  getDataset,
  listDatasets,
  updateDataset,
  deleteDataset,
  incrementRecordCount,
} from "./services/dataset.js";

export {
  // Record
  createRecord,
  getRecord,
  listRecords,
  updateRecordStatus,
  updateRecordData,
  updateRecordVector,
  deleteRecord,
  deleteRecordsByDataset,
  countRecordsByStatus,
} from "./services/record.js";

export {
  // Structure / Sanitize
  structureData,
  sanitizeData,
} from "./services/structure.js";

export {
  // Vectorize
  vectorizeTexts,
  vectorizeSingle,
  cosineSimilarity,
  textToSearchable,
} from "./services/vectorize.js";

export {
  // Graph
  createEntity,
  getEntity,
  listEntities,
  findEntityByName,
  createRelation,
  getRelation,
  listRelations,
  updateEntity,
  updateRelation,
  deleteEntity,
  deleteRelation,
  deleteEntitiesByDataset,
  upsertEntityInNeo4j,
  createRelationInNeo4j,
  deleteEntityFromNeo4j,
  deleteRelationFromNeo4j,
  findGraphPaths,
  getEntityNeighbors,
  extractGraphEntities,
} from "./services/graph.js";

export {
  // Search
  vectorSearch,
  graphSearch,
  hybridSearch,
  search,
} from "./services/search.js";

export {
  // Indexing
  ingestData,
  processPendingRecord,
} from "./services/indexing.js";

// --- Database ---
export { initDb, closeDb, getDb } from "./db/sqlite.js";
export { getNeo4jDriver, closeNeo4j, checkNeo4jHealth, runCypher, runInTransaction } from "./db/neo4j.js";

// --- Config ---
export { getConfig } from "./utils/config.js";
