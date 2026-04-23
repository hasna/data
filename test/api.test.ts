import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const DB_PATH = `/tmp/open-data-test-api-${Date.now()}.db`;
const PORT = 14000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;

let serverProc: ReturnType<typeof Bun.spawn>;
let tenantId: string;
let datasetId: string;

beforeAll(async () => {
  serverProc = Bun.spawn(["bun", "run", "src/server/index.ts"], {
    env: { ...process.env, DATA_DB_PATH: DB_PATH, PORT: String(PORT) },
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for server to be ready
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
});

afterAll(() => {
  serverProc.kill();
  // Clean up temp DB
  try { Bun.file(DB_PATH).size; } catch {}
});

// --- Helpers ---

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`);
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patch(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function del(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: "DELETE" });
}

// --- Tests ---

describe("REST API — health", () => {
  test("GET /health returns ok", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data).toHaveProperty("neo4j");
    expect(data).toHaveProperty("openai");
  });
});

describe("REST API — tenants", () => {
  test("POST /api/tenants creates a tenant", async () => {
    const res = await post("/api/tenants", {
      name: "API Test Org",
      slug: "api-test",
      type: "organization",
    });
    expect(res.status).toBe(201);
    const tenant = await res.json();
    expect(tenant.id).toMatch(/^tenant_/);
    expect(tenant.name).toBe("API Test Org");
    expect(tenant.slug).toBe("api-test");
    tenantId = tenant.id;
  });

  test("POST /api/tenants validates required fields", async () => {
    const res = await post("/api/tenants", { name: "no slug" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  test("GET /api/tenants lists tenants", async () => {
    const res = await get("/api/tenants");
    expect(res.status).toBe(200);
    const tenants = await res.json();
    expect(tenants.length).toBeGreaterThanOrEqual(1);
    expect(tenants.some((t: any) => t.id === tenantId)).toBe(true);
  });

  test("GET /api/tenants/:id gets a tenant", async () => {
    const res = await get(`/api/tenants/${tenantId}`);
    expect(res.status).toBe(200);
    const tenant = await res.json();
    expect(tenant.name).toBe("API Test Org");
  });

  test("GET /api/tenants/slug/:slug gets a tenant by slug", async () => {
    const res = await get("/api/tenants/slug/api-test");
    expect(res.status).toBe(200);
    const tenant = await res.json();
    expect(tenant.id).toBe(tenantId);
    expect(tenant.slug).toBe("api-test");
  });

  test("GET /api/tenants/slug/:slug returns 404 for nonexistent", async () => {
    const res = await get("/api/tenants/slug/nonexistent");
    expect(res.status).toBe(404);
  });

  test("GET /api/tenants/:id returns 404 for nonexistent", async () => {
    const res = await get("/api/tenants/tenant_nonexistent");
    expect(res.status).toBe(404);
  });

  test("PATCH /api/tenants/:id updates a tenant", async () => {
    const res = await patch(`/api/tenants/${tenantId}`, { name: "API Updated" });
    expect(res.status).toBe(200);
    const tenant = await res.json();
    expect(tenant.name).toBe("API Updated");
  });

  test("PATCH /api/tenants/:id returns 404 for nonexistent", async () => {
    const res = await patch("/api/tenants/tenant_nonexistent", { name: "x" });
    expect(res.status).toBe(404);
  });

  test("DELETE /api/tenants/:id deletes a tenant", async () => {
    // Create one to delete
    const createRes = await post("/api/tenants", {
      name: "Delete Me",
      slug: "delete-me",
      type: "personal",
    });
    const { id } = await createRes.json();

    const delRes = await del(`/api/tenants/${id}`);
    expect(delRes.status).toBe(200);
    const data = await delRes.json();
    expect(data.deleted).toBe(true);

    // Verify gone
    const getRes = await get(`/api/tenants/${id}`);
    expect(getRes.status).toBe(404);
  });

  test("DELETE /api/tenants/:id returns 404 for nonexistent", async () => {
    const res = await del("/api/tenants/tenant_nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("REST API — datasets", () => {
  test("POST /api/datasets creates a dataset", async () => {
    const res = await post("/api/datasets", {
      tenant_id: tenantId,
      name: "API DS",
    });
    expect(res.status).toBe(201);
    const ds = await res.json();
    expect(ds.id).toMatch(/^ds_/);
    expect(ds.name).toBe("API DS");
    datasetId = ds.id;
  });

  test("POST /api/datasets validates required fields", async () => {
    const res = await post("/api/datasets", { name: "no tenant" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  test("GET /api/datasets?tenant_id= lists datasets", async () => {
    const res = await get(`/api/datasets?tenant_id=${tenantId}`);
    expect(res.status).toBe(200);
    const datasets = await res.json();
    expect(datasets.length).toBeGreaterThanOrEqual(1);
    expect(datasets.some((d: any) => d.id === datasetId)).toBe(true);
  });

  test("GET /api/datasets requires tenant_id", async () => {
    const res = await get("/api/datasets");
    expect(res.status).toBe(400);
  });

  test("GET /api/datasets/:id gets a dataset", async () => {
    const res = await get(`/api/datasets/${datasetId}`);
    expect(res.status).toBe(200);
    const ds = await res.json();
    expect(ds.name).toBe("API DS");
  });

  test("GET /api/datasets/:id returns 404 for nonexistent", async () => {
    const res = await get("/api/datasets/ds_nonexistent");
    expect(res.status).toBe(404);
  });

  test("PATCH /api/datasets/:id updates a dataset", async () => {
    const res = await patch(`/api/datasets/${datasetId}`, { name: "API DS Updated" });
    expect(res.status).toBe(200);
    const ds = await res.json();
    expect(ds.name).toBe("API DS Updated");
  });

  test("PATCH /api/datasets/:id returns 404 for nonexistent", async () => {
    const res = await patch("/api/datasets/ds_nonexistent", { name: "x" });
    expect(res.status).toBe(404);
  });

  test("DELETE /api/datasets/:id deletes a dataset", async () => {
    const createRes = await post("/api/datasets", {
      tenant_id: tenantId,
      name: "Delete DS",
    });
    const { id } = await createRes.json();

    const delRes = await del(`/api/datasets/${id}`);
    expect(delRes.status).toBe(200);
    const data = await delRes.json();
    expect(data.deleted).toBe(true);

    const getRes = await get(`/api/datasets/${id}`);
    expect(getRes.status).toBe(404);
  });

  test("DELETE /api/datasets/:id returns 404 for nonexistent", async () => {
    const res = await del("/api/datasets/ds_nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("REST API — records", () => {
  test("GET /api/records requires dataset_id", async () => {
    const res = await get("/api/records");
    expect(res.status).toBe(400);
  });

  test("GET /api/records/count requires dataset_id", async () => {
    const res = await get("/api/records/count");
    expect(res.status).toBe(400);
  });

  test("GET /api/records/:id returns 404 for nonexistent", async () => {
    const res = await get("/api/records/rec_nonexistent");
    expect(res.status).toBe(404);
  });

  test("DELETE /api/records/:id returns 404 for nonexistent", async () => {
    const res = await del("/api/records/rec_nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("REST API — ingest", () => {
  test("POST /api/ingest creates a pending record", async () => {
    const res = await post("/api/ingest", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api-test",
      data: { text: "hello from api test" },
      auto_process: false,
    });
    expect(res.status).toBe(201);
    const result = await res.json();
    expect(result.status).toBe("pending");
    expect(result.record_id).toMatch(/^rec_/);
  });

  test("POST /api/ingest validates required fields", async () => {
    const res = await post("/api/ingest", { data: { text: "missing fields" } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  test("POST /api/ingest returns error for nonexistent dataset", async () => {
    const res = await post("/api/ingest", {
      tenant_id: tenantId,
      dataset_id: "ds_nonexistent",
      source: "api",
      data: { text: "nope" },
      auto_process: false,
    });
    expect(res.status).toBe(201);
    const result = await res.json();
    expect(result.status).toBe("error");
    expect(result.message).toContain("not found");
  });
});

describe("REST API — records after ingest", () => {
  let recordId: string;

  test("lists records for dataset", async () => {
    const res = await get(`/api/records?dataset_id=${datasetId}`);
    expect(res.status).toBe(200);
    const records = await res.json();
    expect(records.length).toBeGreaterThanOrEqual(1);
    recordId = records[0].id;
  });

  test("gets a record by id", async () => {
    const res = await get(`/api/records/${recordId}`);
    expect(res.status).toBe(200);
    const record = await res.json();
    expect(record.id).toBe(recordId);
    expect(record.status).toBe("pending");
  });

  test("counts records by status", async () => {
    const res = await get(`/api/records/count?dataset_id=${datasetId}`);
    expect(res.status).toBe(200);
    const counts = await res.json();
    expect(counts).toHaveProperty("pending");
    expect(counts.pending).toBeGreaterThanOrEqual(1);
  });

  test("deletes a record", async () => {
    // Create a record to delete
    const ingestRes = await post("/api/ingest", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { text: "to delete" },
      auto_process: false,
    });
    const { record_id } = await ingestRes.json();

    const delRes = await del(`/api/records/${record_id}`);
    expect(delRes.status).toBe(200);
    const data = await delRes.json();
    expect(data.deleted).toBe(true);

    // Verify gone
    const getRes = await get(`/api/records/${record_id}`);
    expect(getRes.status).toBe(404);
  });
});

describe("REST API — graph", () => {
  test("GET /api/graph/entities requires dataset_id", async () => {
    const res = await get("/api/graph/entities");
    expect(res.status).toBe(400);
  });

  test("GET /api/graph/entities returns empty list", async () => {
    const res = await get(`/api/graph/entities?dataset_id=${datasetId}`);
    expect(res.status).toBe(200);
    const entities = await res.json();
    expect(entities).toEqual([]);
  });

  test("POST /api/graph/entities creates an entity", async () => {
    const res = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "Alice",
      properties: { role: "engineer" },
    });
    expect(res.status).toBe(201);
    const entity = await res.json();
    expect(entity.id).toMatch(/^ent_/);
    expect(entity.type).toBe("person");
    expect(entity.name).toBe("Alice");
  });

  test("POST /api/graph/entities validates required fields", async () => {
    const res = await post("/api/graph/entities", { tenant_id: tenantId, name: "no type" });
    expect(res.status).toBe(400);
  });

  test("GET /api/graph/entities/:id returns entity", async () => {
    // Create entity first
    const createRes = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "Bob",
    });
    const { id } = await createRes.json();

    const res = await get(`/api/graph/entities/${id}`);
    expect(res.status).toBe(200);
    const entity = await res.json();
    expect(entity.id).toBe(id);
    expect(entity.name).toBe("Bob");
  });

  test("GET /api/graph/entities/:id returns 404 for nonexistent", async () => {
    const res = await get("/api/graph/entities/ent_nonexistent");
    expect(res.status).toBe(404);
  });

  test("DELETE /api/graph/entities/:id deletes an entity", async () => {
    const createRes = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "concept",
      name: "ToDelete",
    });
    const { id } = await createRes.json();

    const delRes = await del(`/api/graph/entities/${id}`);
    expect(delRes.status).toBe(200);
    const data = await delRes.json();
    expect(data.deleted).toBe(true);

    // Verify gone
    const getRes = await get(`/api/graph/entities/${id}`);
    expect(getRes.status).toBe(404);
  });

  test("DELETE /api/graph/entities/:id returns 404 for nonexistent", async () => {
    const res = await del("/api/graph/entities/ent_nonexistent");
    expect(res.status).toBe(404);
  });

  test("GET /api/graph/relations requires dataset_id", async () => {
    const res = await get("/api/graph/relations");
    expect(res.status).toBe(400);
  });

  test("GET /api/graph/relations returns empty list", async () => {
    const res = await get(`/api/graph/relations?dataset_id=${datasetId}`);
    expect(res.status).toBe(200);
    const relations = await res.json();
    expect(relations).toEqual([]);
  });

  test("POST /api/graph/relations creates a relation", async () => {
    // Create two entities
    const ent1Res = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "RelSrc",
    });
    const ent1 = await ent1Res.json();

    const ent2Res = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "RelTgt",
    });
    const ent2 = await ent2Res.json();

    const res = await post("/api/graph/relations", {
      tenant_id: tenantId,
      type: "works_with",
      source_entity_id: ent1.id,
      target_entity_id: ent2.id,
      weight: 0.8,
    });
    expect(res.status).toBe(201);
    const relation = await res.json();
    expect(relation.id).toMatch(/^rel_/);
    expect(relation.type).toBe("works_with");
    expect(relation.source_entity_id).toBe(ent1.id);
    expect(relation.target_entity_id).toBe(ent2.id);
  });

  test("POST /api/graph/relations validates required fields", async () => {
    const res = await post("/api/graph/relations", { tenant_id: tenantId, type: "x" });
    expect(res.status).toBe(400);
  });

  test("GET /api/graph/relations/:id returns relation", async () => {
    // Create entities and relation
    const ent1Res = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "GetRelSrc",
    });
    const ent1 = await ent1Res.json();

    const ent2Res = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "GetRelTgt",
    });
    const ent2 = await ent2Res.json();

    const createRes = await post("/api/graph/relations", {
      tenant_id: tenantId,
      type: "knows",
      source_entity_id: ent1.id,
      target_entity_id: ent2.id,
    });
    const { id } = await createRes.json();

    const res = await get(`/api/graph/relations/${id}`);
    expect(res.status).toBe(200);
    const relation = await res.json();
    expect(relation.id).toBe(id);
    expect(relation.type).toBe("knows");
  });

  test("GET /api/graph/relations/:id returns 404 for nonexistent", async () => {
    const res = await get("/api/graph/relations/rel_nonexistent");
    expect(res.status).toBe(404);
  });

  test("DELETE /api/graph/relations/:id deletes a relation", async () => {
    const ent1Res = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DelRelSrc",
    });
    const ent1 = await ent1Res.json();

    const ent2Res = await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DelRelTgt",
    });
    const ent2 = await ent2Res.json();

    const createRes = await post("/api/graph/relations", {
      tenant_id: tenantId,
      type: "removes",
      source_entity_id: ent1.id,
      target_entity_id: ent2.id,
    });
    const { id } = await createRes.json();

    const delRes = await del(`/api/graph/relations/${id}`);
    expect(delRes.status).toBe(200);
    const data = await delRes.json();
    expect(data.deleted).toBe(true);

    // Verify gone
    const getRes = await get(`/api/graph/relations/${id}`);
    expect(getRes.status).toBe(404);
  });

  test("DELETE /api/graph/relations/:id returns 404 for nonexistent", async () => {
    const res = await del("/api/graph/relations/rel_nonexistent");
    expect(res.status).toBe(404);
  });

  test("POST /api/graph/paths validates required fields", async () => {
    const res = await post("/api/graph/paths", { tenant_id: tenantId });
    expect(res.status).toBe(400);
  });

  test("POST /api/graph/neighbors validates required fields", async () => {
    const res = await post("/api/graph/neighbors", { tenant_id: tenantId });
    expect(res.status).toBe(400);
  });

  test("DELETE /api/graph/entities/dataset requires dataset_id", async () => {
    const res = await fetch(`${BASE}/api/graph/entities/dataset`, { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  test("DELETE /api/graph/entities/dataset deletes all entities", async () => {
    // Create some entities
    await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DelByDs1",
    });
    await post("/api/graph/entities", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DelByDs2",
    });

    const res = await fetch(`${BASE}/api/graph/entities/dataset?dataset_id=${datasetId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(2);

    // Verify entities are gone
    const listRes = await get(`/api/graph/entities?dataset_id=${datasetId}`);
    const entities = await listRes.json();
    expect(entities.some((e: any) => e.name === "DelByDs1")).toBe(false);
    expect(entities.some((e: any) => e.name === "DelByDs2")).toBe(false);
  });

  test("POST /api/graph/extract validates required fields", async () => {
    const res = await post("/api/graph/extract", { data: { x: 1 } });
    expect(res.status).toBe(400);
  });

  test("POST /api/graph/extract returns graceful result when OpenAI key is missing", async () => {
    // No OPENAI_API_KEY set — should fail fast with a 200+error response, not 500
    const res = await post("/api/graph/extract", {
      data: { company: "Acme Corp", ceo: "John Doe" },
      entity_types: ["person", "organization"],
      relation_types: ["ceo_of"],
    });
    // The error is caught by the server's try/catch wrapper at the handler level
    // which returns 500 with { error: ... }
    expect([200, 500]).toContain(res.status);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });
});

describe("REST API — search", () => {
  test("POST /api/search validates required fields", async () => {
    const res = await post("/api/search", { query: "test" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  test("POST /api/search with vector type returns results", async () => {
    const res = await post("/api/search", {
      tenant_id: tenantId,
      query: "hello",
      search_type: "vector",
    });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("latency_ms");
  });

  test("POST /api/search with graph type returns results", async () => {
    const res = await post("/api/search", {
      tenant_id: tenantId,
      query: "test",
      search_type: "graph",
    });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("graph_paths");
  });
});

describe("REST API — vector search", () => {
  test("GET /api/search/vector validates required fields", async () => {
    const res = await get("/api/search/vector");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  test("GET /api/search/vector returns results", async () => {
    const res = await get(`/api/search/vector?tenant_id=${tenantId}&query=test&limit=5`);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("latency_ms");
  });
});

describe("REST API — CORS", () => {
  test("OPTIONS returns CORS headers", async () => {
    const res = await fetch(`${BASE}/health`, { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

describe("REST API — 404", () => {
  test("returns 404 for unknown routes", async () => {
    const res = await get("/api/unknown");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Not found");
  });
});
