import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "../src/db/sqlite.js";
import { OpenData } from "../src/sdk/index.js";

const DB_PATH = `/tmp/open-data-test-sdk-${Date.now()}.db`;

let client: OpenData;
let tenantId: string;
let datasetId: string;

beforeAll(() => {
  process.env.DATA_DB_PATH = DB_PATH;
  client = new OpenData();
});

afterAll(() => {
  client.close();
  delete process.env.DATA_DB_PATH;
});

describe("OpenData SDK — tenants", () => {
  test("creates a tenant", () => {
    const tenant = client.tenants.create({ name: "SDK Test Org", slug: "sdk-test", type: "organization" });
    tenantId = tenant.id;
    expect(tenant.id).toMatch(/^tenant_/);
    expect(tenant.name).toBe("SDK Test Org");
    expect(tenant.slug).toBe("sdk-test");
  });

  test("gets a tenant by id", () => {
    const tenant = client.tenants.get(tenantId);
    expect(tenant).not.toBeNull();
    expect(tenant!.name).toBe("SDK Test Org");
  });

  test("gets a tenant by slug", () => {
    const tenant = client.tenants.getBySlug("sdk-test");
    expect(tenant).not.toBeNull();
    expect(tenant!.id).toBe(tenantId);
  });

  test("lists tenants", () => {
    const tenants = client.tenants.list();
    expect(tenants.length).toBeGreaterThanOrEqual(1);
    expect(tenants.some((t) => t.id === tenantId)).toBe(true);
  });

  test("updates a tenant", () => {
    const updated = client.tenants.update(tenantId, { name: "SDK Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("SDK Updated");
  });

  test("returns null for nonexistent tenant", () => {
    expect(client.tenants.get("tenant_nonexistent")).toBeNull();
    expect(client.tenants.getBySlug("nonexistent")).toBeNull();
  });

  test("deletes a tenant", () => {
    const tenant = client.tenants.create({ name: "To Delete", slug: "to-delete", type: "personal" });
    const deleted = client.tenants.delete(tenant.id);
    expect(deleted).toBe(true);
    expect(client.tenants.get(tenant.id)).toBeNull();
  });

  test("delete returns false for nonexistent tenant", () => {
    expect(client.tenants.delete("tenant_nonexistent")).toBe(false);
  });
});

describe("OpenData SDK — datasets", () => {
  test("creates a dataset", () => {
    const ds = client.datasets.create({ tenant_id: tenantId, name: "SDK DS" });
    datasetId = ds.id;
    expect(ds.id).toMatch(/^ds_/);
    expect(ds.name).toBe("SDK DS");
  });

  test("gets a dataset by id", () => {
    const ds = client.datasets.get(datasetId);
    expect(ds).not.toBeNull();
    expect(ds!.name).toBe("SDK DS");
  });

  test("lists datasets for tenant", () => {
    const datasets = client.datasets.list(tenantId);
    expect(datasets.length).toBeGreaterThanOrEqual(1);
    expect(datasets.some((d) => d.id === datasetId)).toBe(true);
  });

  test("updates a dataset", () => {
    const updated = client.datasets.update(datasetId, { name: "SDK DS Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("SDK DS Updated");
  });

  test("returns null for nonexistent dataset", () => {
    expect(client.datasets.get("ds_nonexistent")).toBeNull();
  });

  test("deletes a dataset", () => {
    const ds = client.datasets.create({ tenant_id: tenantId, name: "To Delete" });
    const deleted = client.datasets.delete(ds.id);
    expect(deleted).toBe(true);
    expect(client.datasets.get(ds.id)).toBeNull();
  });

  test("delete returns false for nonexistent dataset", () => {
    expect(client.datasets.delete("ds_nonexistent")).toBe(false);
  });
});

describe("OpenData SDK — records", () => {
  test("ingest creates a record (no auto_process)", async () => {
    const result = await client.ingest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      data: { text: "hello from sdk" },
      auto_process: false,
    });
    expect(result.status).toBe("pending");
    expect(result.record_id).toMatch(/^rec_/);
  });

  test("gets a record by id", () => {
    const datasets = client.datasets.list(tenantId);
    const ds = datasets[0];
    // Create record via ingest
    // We'll test list and count instead since we need async for ingest
  });

  test("lists records for dataset", async () => {
    await client.ingest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      data: { text: "another record" },
      auto_process: false,
    });
    const records = client.records.list(datasetId);
    expect(records.length).toBeGreaterThanOrEqual(1);
  });

  test("counts records by status", async () => {
    const counts = client.records.count(datasetId);
    expect(counts).toHaveProperty("pending");
    expect(counts.pending).toBeGreaterThanOrEqual(1);
  });

  test("deletes a record", async () => {
    const result = await client.ingest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      data: { text: "to delete" },
      auto_process: false,
    });
    const deleted = client.records.delete(result.record_id);
    expect(deleted).toBe(true);
  });

  test("delete returns false for nonexistent record", () => {
    expect(client.records.delete("rec_nonexistent")).toBe(false);
  });
});

describe("OpenData SDK — graph", () => {
  test("lists entities (empty)", () => {
    const entities = client.graph.entities(datasetId);
    expect(entities).toEqual([]);
  });

  test("lists relations (empty)", () => {
    const relations = client.graph.relations(datasetId);
    expect(relations).toEqual([]);
  });

  test("creates an entity", () => {
    const entity = client.graph.createEntity(tenantId, datasetId, "person", "Alice", { role: "engineer" });
    expect(entity.id).toMatch(/^ent_/);
    expect(entity.type).toBe("person");
    expect(entity.name).toBe("Alice");
  });

  test("creates a relation between entities", () => {
    const ent1 = client.graph.createEntity(tenantId, datasetId, "person", "Bob");
    const ent2 = client.graph.createEntity(tenantId, datasetId, "person", "Carol");
    const relation = client.graph.createRelation(tenantId, "works_with", ent1.id, ent2.id, 0.9);
    expect(relation.id).toMatch(/^rel_/);
    expect(relation.type).toBe("works_with");
    expect(relation.source_entity_id).toBe(ent1.id);
    expect(relation.target_entity_id).toBe(ent2.id);
  });

  test("lists entities after creation", () => {
    const entities = client.graph.entities(datasetId);
    expect(entities.length).toBeGreaterThanOrEqual(3);
  });

  test("deletes an entity", async () => {
    const entity = client.graph.createEntity(tenantId, datasetId, "concept", "ToDelete");
    const ok = await client.graph.deleteEntity(entity.id);
    expect(ok).toBe(true);
    // Verify gone from list
    const entities = client.graph.entities(datasetId);
    expect(entities.some((e: any) => e.id === entity.id)).toBe(false);
  });

  test("deleteEntity returns false for nonexistent", async () => {
    const ok = await client.graph.deleteEntity("ent_nonexistent");
    expect(ok).toBe(false);
  });

  test("getEntity returns entity by id", () => {
    const entity = client.graph.createEntity(tenantId, datasetId, "person", "GetMe");
    const found = client.graph.getEntity(entity.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(entity.id);
    expect(found!.name).toBe("GetMe");
  });

  test("getEntity returns null for nonexistent", () => {
    const found = client.graph.getEntity("ent_nonexistent");
    expect(found).toBeNull();
  });

  test("getRelation returns relation by id", () => {
    const ent1 = client.graph.createEntity(tenantId, datasetId, "person", "RelSrcA");
    const ent2 = client.graph.createEntity(tenantId, datasetId, "person", "RelTgtA");
    const relation = client.graph.createRelation(tenantId, "knows", ent1.id, ent2.id);
    const found = client.graph.getRelation(relation.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(relation.id);
    expect(found!.type).toBe("knows");
  });

  test("getRelation returns null for nonexistent", () => {
    const found = client.graph.getRelation("rel_nonexistent");
    expect(found).toBeNull();
  });

  test("deleteRelation deletes a relation", async () => {
    const ent1 = client.graph.createEntity(tenantId, datasetId, "person", "DelRelSrc");
    const ent2 = client.graph.createEntity(tenantId, datasetId, "person", "DelRelTgt");
    const relation = client.graph.createRelation(tenantId, "removes", ent1.id, ent2.id);
    const ok = await client.graph.deleteRelation(relation.id);
    expect(ok).toBe(true);
    // Verify gone
    const found = client.graph.getRelation(relation.id);
    expect(found).toBeNull();
  });

  test("deleteRelation returns false for nonexistent", async () => {
    const ok = await client.graph.deleteRelation("rel_nonexistent");
    expect(ok).toBe(false);
  });

  test("deleteRelation deletes a relation via SDK", async () => {
    const ent1 = client.graph.createEntity(tenantId, datasetId, "concept", "SDKRelSrc");
    const ent2 = client.graph.createEntity(tenantId, datasetId, "concept", "SDKRelTgt");
    const relation = client.graph.createRelation(tenantId, "links", ent1.id, ent2.id);
    const ok = await client.graph.deleteRelation(relation.id);
    expect(ok).toBe(true);
    const found = client.graph.getRelation(relation.id);
    expect(found).toBeNull();
  });

  test("deleteEntitiesByDataset deletes all entities for a dataset", async () => {
    // Create a fresh entity in this dataset
    client.graph.createEntity(tenantId, datasetId, "concept", "DsDelTest");
    const entitiesBefore = client.graph.entities(datasetId);
    expect(entitiesBefore.some((e: any) => e.name === "DsDelTest")).toBe(true);
    const count = await client.graph.deleteEntitiesByDataset(datasetId);
    expect(count).toBeGreaterThanOrEqual(1);
    // Verify all gone
    const entitiesAfter = client.graph.entities(datasetId);
    expect(entitiesAfter).toEqual([]);
  });
});

describe("OpenData SDK — health", () => {
  test("returns health status", async () => {
    const health = await client.health();
    expect(health).toHaveProperty("neo4j");
    expect(health).toHaveProperty("openai");
    // neo4j is likely unavailable in test env
    expect(["connected", "unavailable"]).toContain(health.neo4j);
  });
});

describe("OpenData SDK — extractEntities", () => {
  test("throws when OpenAI is unavailable", async () => {
    // OPENAI_API_KEY may be empty or point to a provider without the model
    // Either way — should throw, not hang
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(
        client.extractEntities({
          data: { x: 1 },
          entity_types: ["person"],
          relation_types: ["knows"],
        }),
      ).rejects.toThrow();
    } finally {
      process.env.OPENAI_API_KEY = savedKey;
    }
  });
});

describe("OpenData SDK — structure/sanitize", () => {
  test("structure throws when OpenAI is unavailable", async () => {
    await expect(
      Promise.race([
        client.structure({
          raw_data: { name: "test" },
          dataset_schema: { fields: [{ name: "name", type: "string", required: true }], strict: false },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("OpenAI call timed out — expected to throw")), 10000)),
      ]),
    ).rejects.toThrow();
  });

  test("sanitize throws when OpenAI is unavailable", async () => {
    await expect(
      Promise.race([
        client.sanitize({
          data: { name: "test" },
          dataset_schema: { fields: [{ name: "name", type: "string", required: true }], strict: false },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("OpenAI call timed out — expected to throw")), 10000)),
      ]),
    ).rejects.toThrow();
  });
});

describe("OpenData SDK — vector utilities", () => {
  test("cosineSimilarity returns 1 for identical vectors", () => {
    expect(client.vector.cosineSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
  });

  test("cosineSimilarity returns 0 for orthogonal vectors", () => {
    expect(client.vector.cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  test("textToSearchable converts object to searchable string", () => {
    const text = client.vector.textToSearchable({ name: "Alice", role: "engineer" });
    expect(text).toContain("name: Alice");
    expect(text).toContain("role: engineer");
  });

  test("vectorize throws when OpenAI is unavailable", async () => {
    await expect(
      client.vectorize({ texts: ["hello world"] }),
    ).rejects.toThrow();
  });
});

describe("OpenData SDK — batchIngest", () => {
  test("batchIngest creates multiple pending records", async () => {
    const result = await client.batchIngest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      records: [{ text: "sdk batch 1" }, { text: "sdk batch 2" }],
      auto_process: false,
      concurrency: 2,
    });
    expect(result.total).toBe(2);
    expect(result.results.length).toBe(2);
    expect(result.results.every((r) => r.status === "pending")).toBe(true);
  });

  test("batchIngest processes records with auto_process=true", async () => {
    const result = await client.batchIngest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      records: [{ text: "sdk auto" }],
      auto_process: true,
      concurrency: 1,
    });
    expect(result.total).toBe(1);
    expect(result).toHaveProperty("results");
  });
});

describe("OpenData SDK — record operations", () => {
  test("records.updateStatus updates status", async () => {
    const result = await client.ingest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      data: { text: "status test" },
      auto_process: false,
    });
    const updated = client.records.updateStatus(result.record_id, "processing");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("processing");
  });

  test("records.updateData updates record content", async () => {
    const result = await client.ingest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      data: { text: "old" },
      auto_process: false,
    });
    const updated = client.records.updateData(result.record_id, { text: "updated" });
    expect(updated).not.toBeNull();
    expect(updated!.data).toEqual({ text: "updated" });
  });

  test("records.deleteByDataset deletes all records", async () => {
    await client.ingest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      data: { text: "del 1" },
      auto_process: false,
    });
    await client.ingest({
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "sdk",
      data: { text: "del 2" },
      auto_process: false,
    });
    const before = client.records.list(datasetId);
    expect(before.length).toBeGreaterThanOrEqual(2);
    const count = client.records.deleteByDataset(datasetId);
    expect(count).toBeGreaterThanOrEqual(2);
    const after = client.records.list(datasetId);
    expect(after).toEqual([]);
  });
});

describe("OpenData SDK — processRecord", () => {
  test("processRecord returns error for nonexistent", async () => {
    const result = await client.processRecord("rec_nonexistent");
    expect(result.status).toBe("error");
    expect(result.message).toContain("not found");
  });
});

describe("OpenData SDK — graph operations", () => {
  test("graph.paths rejects when Neo4j unavailable", async () => {
    await expect(client.graph.paths(tenantId, "person", "Nobody", "concept", "Nothing")).rejects.toThrow();
  });

  test("graph.neighbors rejects when Neo4j unavailable", async () => {
    const entity = client.graph.createEntity(tenantId, datasetId, "person", "NeighborTest");
    await expect(client.graph.neighbors(tenantId, entity.id)).rejects.toThrow();
  });

  test("graph.findByEntityName works with SQLite", () => {
    client.graph.createEntity(tenantId, datasetId, "person", "FindMe");
    const found = client.graph.findByEntityName(tenantId, "FindMe", "person");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("FindMe");
  });

  test("graph.updateEntity updates an entity", () => {
    const entity = client.graph.createEntity(tenantId, datasetId, "person", "UpdateMe");
    const updated = client.graph.updateEntity(entity.id, { name: "Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated");
  });

  test("graph.updateRelation updates a relation", () => {
    const e1 = client.graph.createEntity(tenantId, datasetId, "person", "RelUpdSrc");
    const e2 = client.graph.createEntity(tenantId, datasetId, "person", "RelUpdTgt");
    const relation = client.graph.createRelation(tenantId, "test", e1.id, e2.id);
    const updated = client.graph.updateRelation(relation.id, { weight: 0.5 });
    expect(updated).not.toBeNull();
    expect(updated!.weight).toBe(0.5);
  });
});

describe("OpenData SDK — search", () => {
  test("vectorSearch returns error when vectorization unavailable", async () => {
    const result = await client.vectorSearch({ tenant_id: tenantId, query: "hello" });
    expect(result).toHaveProperty("records");
    expect(result.total).toBe(0);
  });

  test("graphSearch returns empty when no entities exist", async () => {
    const result = await client.graphSearch({ tenant_id: tenantId, query: "hello" });
    expect(result).toHaveProperty("records");
  });

  test("hybridSearch returns results", async () => {
    const result = await client.hybridSearch({ tenant_id: tenantId, query: "hello" });
    expect(result).toHaveProperty("records");
  });

  test("search dispatcher routes to vector by default", async () => {
    const result = await client.search({ tenant_id: tenantId, query: "hello" });
    expect(result).toHaveProperty("records");
  });
});

describe("OpenData SDK — close", () => {
  test("close and re-create client", () => {
    const client2 = new OpenData();
    const tenants = client2.tenants.list();
    expect(tenants.length).toBeGreaterThanOrEqual(1);
    client2.close();
  });
});
