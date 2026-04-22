// ============================================================
// @hasna/data — Core Type Definitions
// ============================================================

// --- Tenant ---

export type TenantType = "personal" | "organization" | "team";

export interface TenantSettings {
  default_embedding_model: string;
  default_structure_model: string;
  neo4j_database: string;
  max_datasets: number;
  retention_days: number | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: TenantType;
  settings: TenantSettings;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  type: TenantType;
  settings?: Partial<TenantSettings>;
}

// --- Dataset ---

export interface FieldDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "json" | "text";
  required: boolean;
  description?: string;
}

export interface DatasetSchema {
  fields: FieldDefinition[];
  strict: boolean;
}

export interface VectorConfig {
  enabled: boolean;
  model: string;
  dimensions: number;
  auto_embed: boolean;
}

export interface GraphConfig {
  enabled: boolean;
  auto_extract: boolean;
  entity_types: string[];
  relation_types: string[];
}

export type DatasetSourceType = "session" | "file" | "api" | "manual" | "connector";

export interface Dataset {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  schema: DatasetSchema;
  source_type: DatasetSourceType;
  vector_config: VectorConfig;
  graph_config: GraphConfig;
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDatasetInput {
  tenant_id: string;
  name: string;
  description?: string;
  schema?: Partial<DatasetSchema>;
  source_type?: DatasetSourceType;
  vector_config?: Partial<VectorConfig>;
  graph_config?: Partial<GraphConfig>;
}

// --- DataRecord ---

export interface DataRecord {
  id: string;
  dataset_id: string;
  tenant_id: string;
  data: Record<string, unknown>;
  raw_data?: unknown;
  vector?: number[];
  status: "pending" | "structured" | "sanitized" | "vectorized" | "graphed" | "complete" | "error";
  error?: string;
  created_at: string;
  updated_at: string;
}

// --- Entity (Graph) ---

export interface Entity {
  id: string;
  tenant_id: string;
  dataset_id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Relation {
  id: string;
  tenant_id: string;
  type: string;
  source_entity_id: string;
  target_entity_id: string;
  weight: number;
  properties: Record<string, unknown>;
  created_at: string;
}

// --- Search ---

export type SearchType = "vector" | "graph" | "hybrid";

export interface SearchFilters {
  datasets?: string[];
  entity_types?: string[];
  date_from?: string;
  date_to?: string;
  source_type?: DatasetSourceType;
}

export interface SearchRequest {
  tenant_id: string;
  query: string;
  datasets?: string[];
  search_type: SearchType;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
}

export interface SearchResultRecord {
  record: DataRecord;
  score: number;
  highlights?: string[];
}

export interface GraphPath {
  nodes: Entity[];
  edges: Relation[];
  total_weight: number;
}

export interface SearchResult {
  records: SearchResultRecord[];
  graph_paths?: GraphPath[];
  total: number;
  latency_ms: number;
  error?: string;
}

// --- OpenAI Pipeline ---

export interface StructureRequest {
  raw_data: unknown;
  dataset_schema: DatasetSchema;
  model?: string;
}

export interface StructureResult {
  structured: Record<string, unknown>;
  confidence: number;
  fields_extracted: string[];
  fields_missing: string[];
}

export interface SanitizeRequest {
  data: Record<string, unknown>;
  dataset_schema: DatasetSchema;
  remove_pii?: boolean;
  model?: string;
}

export interface SanitizeResult {
  sanitized: Record<string, unknown>;
  pii_removed: string[];
  duplicates_found: number;
  validation_errors: string[];
}

export interface VectorizeRequest {
  texts: string[];
  model?: string;
}

export interface VectorizeResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  total_tokens: number;
}

export interface GraphExtractRequest {
  data: Record<string, unknown>;
  entity_types: string[];
  relation_types: string[];
  model?: string;
}

export interface GraphExtractResult {
  entities: Array<{ name: string; type: string; properties: Record<string, unknown> }>;
  relations: Array<{
    source: string;
    target: string;
    type: string;
    weight?: number;
    properties?: Record<string, unknown>;
  }>;
}

// --- Ingest ---

export interface IngestRequest {
  tenant_id: string;
  dataset_id: string;
  source: "file" | "session" | "api" | "manual" | "sdk";
  data: unknown;
  auto_process?: boolean;
}

export interface IngestResult {
  record_id: string;
  status: DataRecord["status"];
  message: string;
}

// --- Config ---

export interface DataConfig {
  db_path: string;
  neo4j_uri: string;
  neo4j_user: string;
  neo4j_password: string;
  openai_api_key: string;
  openai_base_url: string;
  port: number;
  log_level: "debug" | "info" | "warn" | "error";
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  default_embedding_model: "text-embedding-3-small",
  default_structure_model: "gpt-4o-mini",
  neo4j_database: "neo4j",
  max_datasets: 100,
  retention_days: null,
};

export const DEFAULT_VECTOR_CONFIG: VectorConfig = {
  enabled: true,
  model: "text-embedding-3-small",
  dimensions: 1536,
  auto_embed: true,
};

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  enabled: true,
  auto_extract: true,
  entity_types: ["person", "concept", "code_module", "project", "session", "document"],
  relation_types: ["depends_on", "authored", "references", "contains", "related_to", "mentions"],
};
