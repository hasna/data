import { describe, test, expect, beforeAll, afterAll, mock, spyOn } from "bun:test";
import { initDb, closeDb } from "../src/db/sqlite.js";
import { createTenant } from "../src/services/tenant.js";
import { createDataset, updateDataset, deleteDataset } from "../src/services/dataset.js";
import { getRecord, updateRecordStatus, updateRecordVector } from "../src/services/record.js";
import { createEntity, getEntity, listEntities } from "../src/services/graph.js";
import { ingestData, processPendingRecord, batchIngestData } from "../src/services/indexing.js";

import * as structureMod from "../src/services/structure.js";
import * as vectorizeMod from "../src/services/vectorize.js";
import * as graphMod from "../src/services/graph.js";
import * as neo4jMod from "../src/db/neo4j.js";

const DB_PATH = `/tmp/open-data-test-indexing-${Date.now()}.db`;
let tenantId: string;
let datasetId: string;

beforeAll(() => {
  process.env.DATA_DB_PATH = DB_PATH;
  initDb();
  const tenant = createTenant({ name: "Indexing Test", slug: "indexing-test", type: "organization" });
  tenantId = tenant.id;
  const ds = createDataset({ tenant_id: tenantId, name: "Index DS" });
  datasetId = ds.id;
});

afterAll(() => {
  closeDb();
  delete process.env.DATA_DB_PATH;
});

describe("ingestData — no auto_process", () => {
  test("creates a pending record when auto_process is false", async () => {
    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { title: "Hello", body: "World" },
      auto_process: false,
    });

    expect(result.status).toBe("pending");
    expect(result.record_id).toMatch(/^rec_/);
    expect(result.message).toContain("awaiting processing");

    const record = getRecord(result.record_id);
    expect(record).not.toBeNull();
    expect(record!.status).toBe("pending");
  });

  test("stores raw_data in the record", async () => {
    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { raw: "input" },
      auto_process: false,
    });

    const record = getRecord(result.record_id);
    expect(record!.raw_data).toEqual({ raw: "input" });
  });
});

describe("ingestData — dataset not found", () => {
  test("returns error for nonexistent dataset", async () => {
    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: "ds_nonexistent",
      source: "api",
      data: { text: "test" },
      auto_process: true,
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("not found");
    expect(result.record_id).toBe("");
  });
});

describe("ingestData — auto_process with mocked pipeline", () => {
  test("completes full pipeline when all steps succeed", async () => {
    // Mock structureData
    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { title: "Hello", body: "World" },
      confidence: 0.9,
      fields_extracted: ["title", "body"],
      fields_missing: [],
    });

    // Mock sanitizeData
    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { title: "Hello", body: "World" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    // Mock vectorizeSingle
    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    // Mock extractGraphEntities
    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [{ name: "Hello", type: "concept", properties: {} }],
      relations: [],
    });

    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { title: "Hello", body: "World" },
      auto_process: true,
    });

    expect(result.status).toBe("complete");
    expect(result.record_id).toMatch(/^rec_/);

    const record = getRecord(result.record_id);
    expect(record!.status).toBe("complete");

    // Restore spies
    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("completes when vectorization fails (non-fatal)", async () => {
    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { text: "fail vec" },
      confidence: 0.8,
      fields_extracted: ["text"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { text: "fail vec" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    // Vectorization throws
    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockRejectedValue(
      new Error("API key not set")
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [],
      relations: [],
    });

    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { text: "fail vec" },
      auto_process: true,
    });

    // Should still complete even though vectorization failed
    expect(result.status).toBe("complete");

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("completes when graph extraction fails (non-fatal)", async () => {
    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { text: "fail graph" },
      confidence: 0.8,
      fields_extracted: ["text"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { text: "fail graph" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    // Graph extraction throws
    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockRejectedValue(
      new Error("No API key")
    );

    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { text: "fail graph" },
      auto_process: true,
    });

    expect(result.status).toBe("complete");

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("returns error when structure/sanitize pipeline fails", async () => {
    // Since the default dataset has no schema fields, structureData is skipped.
    // sanitizeData is the one that actually runs and needs to be mocked to fail.
    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockRejectedValue(
      new Error("API unavailable")
    );

    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { text: "will fail" },
      auto_process: true,
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("Processing failed");

    sanitizeSpy.mockRestore();
  });

  test("creates graph entities and relations when extraction succeeds", async () => {
    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { author: "Alice", topic: "React" },
      confidence: 0.9,
      fields_extracted: ["author", "topic"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { author: "Alice", topic: "React" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [
        { name: "Alice", type: "person", properties: {} },
        { name: "React", type: "concept", properties: {} },
      ],
      relations: [
        { source: "Alice", target: "React", type: "references", weight: 0.9 },
      ],
    });

    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { author: "Alice", topic: "React" },
      auto_process: true,
    });

    expect(result.status).toBe("complete");

    // Verify entities were created
    const entities = listEntities(datasetId);
    const aliceEntity = entities.find((e) => e.name === "Alice");
    expect(aliceEntity).toBeDefined();
    expect(aliceEntity!.type).toBe("person");

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("increments dataset record_count on completion", async () => {
    const { getDataset } = await import("../src/services/dataset.js");
    const dsBefore = getDataset(datasetId);
    const countBefore = dsBefore!.record_count;

    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { x: 1 },
      confidence: 0.9,
      fields_extracted: ["x"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { x: 1 },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [],
      relations: [],
    });

    await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { x: 1 },
      auto_process: true,
    });

    const dsAfter = getDataset(datasetId);
    expect(dsAfter!.record_count).toBe(countBefore + 1);

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });
});

describe("batchIngestData", () => {
  test("ingests multiple records with auto_process=false", async () => {
    const result = await batchIngestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      records: [{ a: 1 }, { b: 2 }, { c: 3 }],
      auto_process: false,
      concurrency: 3,
    });

    expect(result.total).toBe(3);
    expect(result.results.length).toBe(3);
    expect(result.results.every((r) => r.status === "pending")).toBe(true);
  });

  test("processes all records when auto_process=true with mocked pipeline", async () => {
    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { item: "test" },
      confidence: 0.9,
      fields_extracted: ["item"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { item: "test" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [],
      relations: [],
    });

    const result = await batchIngestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      records: [{ item: "one" }, { item: "two" }],
      auto_process: true,
      concurrency: 2,
    });

    expect(result.total).toBe(2);
    expect(result.results.every((r) => r.status === "complete")).toBe(true);

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("handles partial failures gracefully", async () => {
    let callCount = 0;
    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("API unavailable");
      }
      return {
        sanitized: { item: "ok" },
        pii_removed: [],
        duplicates_found: 0,
        validation_errors: [],
      };
    });

    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { item: "ok" },
      confidence: 0.9,
      fields_extracted: ["item"],
      fields_missing: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [],
      relations: [],
    });

    const result = await batchIngestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      records: [{ item: "fail" }, { item: "ok" }, { item: "ok2" }],
      auto_process: true,
      concurrency: 3,
    });

    expect(result.total).toBe(3);
    expect(result.results.some((r) => r.status === "error")).toBe(true);

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("returns error for nonexistent dataset", async () => {
    const result = await batchIngestData({
      tenant_id: tenantId,
      dataset_id: "ds_nonexistent",
      source: "api",
      records: [{ x: 1 }],
      auto_process: true,
      concurrency: 1,
    });

    expect(result.total).toBe(1);
    expect(result.results[0].status).toBe("error");
  });
});

describe("processPendingRecord", () => {
  test("returns error for nonexistent record", async () => {
    const result = await processPendingRecord("rec_nonexistent");
    expect(result.status).toBe("error");
    expect(result.message).toContain("not found");
  });

  test("re-processes a pending record through the pipeline", async () => {
    // First create a pending record
    const ingestResult = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { reprocess: true },
      auto_process: false,
    });

    expect(ingestResult.status).toBe("pending");

    // Mock the pipeline for reprocessing
    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { reprocess: true },
      confidence: 0.9,
      fields_extracted: ["reprocess"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { reprocess: true },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [],
      relations: [],
    });

    const result = await processPendingRecord(ingestResult.record_id);
    expect(result.status).toBe("complete");

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("processes a record with graph extraction creating entities and relations", async () => {
    const ingestResult = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { author: "Bob", topic: "Vue" },
      auto_process: false,
    });

    expect(ingestResult.status).toBe("pending");

    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { author: "Bob", topic: "Vue" },
      confidence: 0.9,
      fields_extracted: ["author", "topic"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { author: "Bob", topic: "Vue" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [
        { name: "Bob", type: "person", properties: {} },
        { name: "Vue", type: "concept", properties: {} },
      ],
      relations: [
        { source: "Bob", target: "Vue", type: "uses", weight: 0.9 },
      ],
    });

    const result = await processPendingRecord(ingestResult.record_id);
    expect(result.status).toBe("complete");

    const entities = listEntities(datasetId);
    const bobEntity = entities.find((e) => e.name === "Bob");
    expect(bobEntity).toBeDefined();

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("returns error when pipeline fails during processing", async () => {
    const ingestResult = await ingestData({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { fail: true },
      auto_process: false,
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockRejectedValue(
      new Error("Pipeline unavailable")
    );

    const result = await processPendingRecord(ingestResult.record_id);
    expect(result.status).toBe("error");
    expect(result.message).toContain("Processing failed");

    sanitizeSpy.mockRestore();
  });
});

describe("ingestData — dataset with schema", () => {
  let schemaDsId: string;

  beforeAll(() => {
    const ds = createDataset({ tenant_id: tenantId, name: "Schema DS" });
    schemaDsId = ds.id;
    updateDataset(ds.id, {
      schema: {
        fields: [{ name: "title", type: "string", required: true }],
        strict: false,
      },
    });
  });

  test("calls structureData when dataset has schema fields", async () => {
    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { title: "Hello" },
      confidence: 0.9,
      fields_extracted: ["title"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { title: "Hello" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [],
      relations: [],
    });

    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: schemaDsId,
      source: "api",
      data: { raw_note: "Hello" },
      auto_process: true,
    });

    expect(result.status).toBe("complete");
    expect(structureSpy).toHaveBeenCalled();

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("processPendingRecord with schema fields calls structureData", async () => {
    const ingestResult = await ingestData({
      tenant_id: tenantId,
      dataset_id: schemaDsId,
      source: "api",
      data: { raw_note: "schema process test" },
      auto_process: false,
    });

    expect(ingestResult.status).toBe("pending");

    const structureSpy = spyOn(structureMod, "structureData").mockResolvedValue({
      structured: { title: "Schema Processed" },
      confidence: 0.9,
      fields_extracted: ["title"],
      fields_missing: [],
    });

    const sanitizeSpy = spyOn(structureMod, "sanitizeData").mockResolvedValue({
      sanitized: { title: "Schema Processed" },
      pii_removed: [],
      duplicates_found: 0,
      validation_errors: [],
    });

    const vectorizeSpy = spyOn(vectorizeMod, "vectorizeSingle").mockResolvedValue(
      new Array(1536).fill(0.1)
    );

    const extractSpy = spyOn(graphMod, "extractGraphEntities").mockResolvedValue({
      entities: [],
      relations: [],
    });

    const result = await processPendingRecord(ingestResult.record_id);
    expect(result.status).toBe("complete");
    expect(structureSpy).toHaveBeenCalled();

    structureSpy.mockRestore();
    sanitizeSpy.mockRestore();
    vectorizeSpy.mockRestore();
    extractSpy.mockRestore();
  });

  test("processPendingRecord returns error when dataset is deleted", async () => {
    const result = await ingestData({
      tenant_id: tenantId,
      dataset_id: schemaDsId,
      source: "api",
      data: { text: "will be orphaned" },
      auto_process: false,
    });

    expect(result.status).toBe("pending");

    const ds = createDataset({ tenant_id: tenantId, name: "Temp to Delete" });
    const tempResult = await ingestData({
      tenant_id: tenantId,
      dataset_id: ds.id,
      source: "api",
      data: { text: "orphan test" },
      auto_process: false,
    });

    deleteDataset(ds.id);

    const procResult = await processPendingRecord(tempResult.record_id);
    expect(procResult.status).toBe("error");
    expect(procResult.message).toContain("not found");
  });
});
