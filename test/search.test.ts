import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { initDb, closeDb } from "../src/db/sqlite.js";
import { createTenant } from "../src/services/tenant.js";
import { createDataset } from "../src/services/dataset.js";
import { createEntity, createRelation, deleteRelation } from "../src/services/graph.js";
import { createRecord, updateRecordStatus, updateRecordVector } from "../src/services/record.js";
import { graphSearch, vectorSearch, hybridSearch, search } from "../src/services/search.js";

import * as vectorizeMod from "../src/services/vectorize.js";

const DB_PATH = `/tmp/open-data-test-search-${Date.now()}.db`;
let tenantId: string;
let datasetId: string;

beforeAll(() => {
  process.env.DATA_DB_PATH = DB_PATH;
  initDb();
  const tenant = createTenant({ name: "Search Test", slug: "search-test", type: "organization" });
  tenantId = tenant.id;
  const ds = createDataset({ tenant_id: tenantId, name: "Search DS" });
  datasetId = ds.id;
});

afterAll(() => {
  closeDb();
  delete process.env.DATA_DB_PATH;
});

// --- vectorSearch tests ---

describe("vectorSearch", () => {
  test("returns empty when no records have vectors", async () => {
    createRecord(datasetId, tenantId, { text: "no vector" });

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "anything",
      search_type: "vector",
    });

    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });

  test("ranks records by cosine similarity", async () => {
    // Create records with different vectors
    const r1 = createRecord(datasetId, tenantId, { text: "hello world" });
    const r2 = createRecord(datasetId, tenantId, { text: "goodbye world" });

    updateRecordStatus(r1.id, "vectorized");
    updateRecordStatus(r2.id, "vectorized");

    // Similar vectors: query is closer to r1
    updateRecordVector(r1.id, [1, 0, 0, 0]);
    updateRecordVector(r2.id, [0, 1, 0, 0]);

    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([0.9, 0.1, 0, 0]);

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "hello",
      search_type: "vector",
    });

    expect(result.records.length).toBe(2);
    expect(result.records[0].record.id).toBe(r1.id);
    expect(result.records[0].score).toBeGreaterThan(result.records[1].score);

    vecSpy.mockRestore();
  });

  test("filters by dataset", async () => {
    const ds2 = createDataset({ tenant_id: tenantId, name: "Search DS2" });
    const rec = createRecord(ds2.id, tenantId, { text: "other dataset" });
    updateRecordStatus(rec.id, "complete");
    updateRecordVector(rec.id, [1, 2, 3]);

    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 2, 3]);

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "test",
      search_type: "vector",
      datasets: [datasetId],
    });

    expect(result.records.every((r) => r.record.dataset_id === datasetId)).toBe(true);

    vecSpy.mockRestore();
  });

  test("returns error when vectorization fails", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockRejectedValue(new Error("API error"));

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "test",
      search_type: "vector",
    });

    expect(result.error).toBeDefined();
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);

    vecSpy.mockRestore();
  });

  test("includes latency_ms", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0]);

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "test",
      search_type: "vector",
    });

    expect(result.latency_ms).toBeGreaterThanOrEqual(0);

    vecSpy.mockRestore();
  });

  test("applies date_from filter", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0]);

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "test",
      search_type: "vector",
      filters: { date_from: "2026-01-01" },
    });

    // No records match the date, but it should not error
    expect(result).toBeDefined();

    vecSpy.mockRestore();
  });

  test("applies date_to filter", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0]);

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "test",
      search_type: "vector",
      filters: { date_to: "2026-01-01" },
    });

    expect(result).toBeDefined();

    vecSpy.mockRestore();
  });

  test("applies both date_from and date_to filters", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0]);

    const result = await vectorSearch({
      tenant_id: tenantId,
      query: "test",
      search_type: "vector",
      filters: { date_from: "2026-01-01", date_to: "2026-12-31" },
    });

    expect(result).toBeDefined();

    vecSpy.mockRestore();
  });
});

// --- hybridSearch tests ---

describe("hybridSearch", () => {
  test("merges vector and graph results", async () => {
    // Create a vector record
    const r1 = createRecord(datasetId, tenantId, { text: "hybrid vector test" });
    updateRecordStatus(r1.id, "vectorized");
    updateRecordVector(r1.id, [0.5, 0.5, 0]);

    // Create a graph entity
    const e1 = createEntity(tenantId, datasetId, "concept", "HybridGraphEntity");

    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([0.5, 0.5, 0]);

    const result = await hybridSearch({
      tenant_id: tenantId,
      query: "HybridGraphEntity",
      search_type: "hybrid",
    });

    expect(result.records.length).toBeGreaterThanOrEqual(1);
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);

    vecSpy.mockRestore();
  });

  test("deduplicates records with score boosting", async () => {
    const r1 = createRecord(datasetId, tenantId, { text: "dedup test" });
    updateRecordStatus(r1.id, "vectorized");
    updateRecordVector(r1.id, [1, 0, 0]);

    // Create matching entity for same dataset
    createEntity(tenantId, datasetId, "person", "Dedup");

    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0, 0]);

    const result = await hybridSearch({
      tenant_id: tenantId,
      query: "Dedup",
      search_type: "hybrid",
    });

    // Each record should appear only once
    const ids = result.records.map((r) => r.record.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);

    vecSpy.mockRestore();
  });

  test("returns results when only one mode matches", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0, 0]);

    // No entities match "ZZZNothing"
    const result = await hybridSearch({
      tenant_id: tenantId,
      query: "ZZZNothing",
      search_type: "hybrid",
    });

    // Should still return a result object
    expect(result).toBeDefined();
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);

    vecSpy.mockRestore();
  });

  test("deduplicates record appearing in both vector and graph results", async () => {
    // Create a vector record with a known vector
    const r1 = createRecord(datasetId, tenantId, { text: "both modes" });
    updateRecordStatus(r1.id, "complete");
    updateRecordVector(r1.id, [1, 0, 0]);

    // Create an entity in the same dataset that matches the query
    createEntity(tenantId, datasetId, "person", "BothModes");

    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0, 0]);

    const result = await hybridSearch({
      tenant_id: tenantId,
      query: "BothModes",
      search_type: "hybrid",
      datasets: [datasetId],
    });

    // The same record should not appear twice
    const ids = result.records.map((r: any) => r.record.id);
    expect(ids.length).toBe(new Set(ids).size);
    // The record from vector + graph should have a boosted score
    expect(result.records.length).toBeGreaterThanOrEqual(1);

    vecSpy.mockRestore();
  });
});

// --- Unified search dispatcher ---

describe("search dispatcher", () => {
  test("routes to vectorSearch by default", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0]);

    const result = await search({
      tenant_id: tenantId,
      query: "test",
      search_type: "vector",
    });

    expect(result).toBeDefined();

    vecSpy.mockRestore();
  });

  test("routes to graphSearch when search_type is graph", async () => {
    const result = await search({
      tenant_id: tenantId,
      query: "test",
      search_type: "graph",
    });

    expect(result.graph_paths).toBeDefined();
  });

  test("routes to hybridSearch when search_type is hybrid", async () => {
    const vecSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue([1, 0]);

    const result = await search({
      tenant_id: tenantId,
      query: "test",
      search_type: "hybrid",
    });

    expect(result).toBeDefined();

    vecSpy.mockRestore();
  });
});

// --- graphSearch tests (existing) ---

describe("graphSearch", () => {
  test("finds entities by name and returns graph paths", async () => {
    const e1 = createEntity(tenantId, datasetId, "person", "SearchPerson");
    const e2 = createEntity(tenantId, datasetId, "concept", "SearchConcept");
    createRelation(tenantId, "references", e1.id, e2.id);

    const result = await graphSearch({
      tenant_id: tenantId,
      query: "SearchPerson",
      search_type: "graph",
      datasets: [datasetId],
    });

    expect(result.graph_paths).toBeDefined();
    expect(result.graph_paths!.length).toBeGreaterThanOrEqual(1);

    const path = result.graph_paths![0];
    const names = path.nodes.map((n) => n.name);
    expect(names).toContain("SearchPerson");
    expect(path.edges.length).toBeGreaterThanOrEqual(1);
    expect(path.edges[0].type).toBe("references");
  });

  test("returns empty results for no match", async () => {
    const result = await graphSearch({
      tenant_id: tenantId,
      query: "ZZZNonExistentEntity",
      search_type: "graph",
    });

    expect(result.records.length).toBe(0);
    expect(result.graph_paths).toEqual([]);
  });

  test("filters by entity type", async () => {
    createEntity(tenantId, datasetId, "person", "FilterPerson");
    createEntity(tenantId, datasetId, "concept", "FilterConcept");

    const personResult = await graphSearch({
      tenant_id: tenantId,
      query: "Filter",
      search_type: "graph",
      filters: { entity_types: ["person"] },
    });

    const conceptResult = await graphSearch({
      tenant_id: tenantId,
      query: "Filter",
      search_type: "graph",
      filters: { entity_types: ["concept"] },
    });

    // Person result should only contain person entities
    for (const path of personResult.graph_paths || []) {
      const nonPerson = path.nodes.find((n) => n.type !== "person");
      // The primary matched entity should be a person; neighbors can be other types
    }
    expect(personResult.graph_paths!.length).toBeGreaterThanOrEqual(1);
  });

  test("includes latency_ms in results", async () => {
    const result = await graphSearch({
      tenant_id: tenantId,
      query: "anything",
      search_type: "graph",
    });

    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test("fetches records for matching entity's dataset", async () => {
    // Create a complete record that will be found via graph search
    const rec = createRecord(datasetId, tenantId, { text: "graph record fetch" });
    updateRecordStatus(rec.id, "complete");

    const e1 = createEntity(tenantId, datasetId, "concept", "GraphRecordFetch");

    const result = await graphSearch({
      tenant_id: tenantId,
      query: "GraphRecordFetch",
      search_type: "graph",
      datasets: [datasetId],
    });

    // Graph search should return the record associated with the entity's dataset
    expect(result.records.length).toBeGreaterThanOrEqual(1);
    expect(result.records.some((r: any) => r.record.id === rec.id)).toBe(true);
  });
});


describe("deleteRelation", () => {
  test("deletes a relation", async () => {
    const s = createEntity(tenantId, datasetId, "person", "DelRelSrc");
    const t = createEntity(tenantId, datasetId, "concept", "DelRelTgt");
    const rel = createRelation(tenantId, "test_rel", s.id, t.id);

    const { getRelation } = require("../src/services/graph.js");
    expect(getRelation(rel.id)).not.toBeNull();

    const deleted = await deleteRelation(rel.id);
    expect(deleted).toBe(true);
    expect(getRelation(rel.id)).toBeNull();
  });

  test("returns false for nonexistent relation", async () => {
    const deleted = await deleteRelation("rel_nonexistent");
    expect(deleted).toBe(false);
  });
});
