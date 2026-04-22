import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DB_PATH = `/tmp/open-data-test-mcp-${Date.now()}.db`;

let client: Client;
let transport: StdioClientTransport;
let tenantId: string;
let datasetId: string;

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "src/mcp/index.ts"],
    env: {
      ...process.env,
      DATA_DB_PATH: DB_PATH,
      OPENAI_API_KEY: "",
    } as Record<string, string>,
    stderr: "pipe",
  });

  client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
  try { transport.close(); } catch {}
  try { Bun.file(DB_PATH).size; } catch {}
});

// --- Helpers ---

async function callTool(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

function parseContent(result: any): any {
  if (result.content && result.content[0]?.type === "text") {
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return result.content[0].text;
    }
  }
  return result;
}

// --- Tests ---

describe("MCP — list tools", () => {
  test("server exposes 39 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBe(39);
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_tenant");
    expect(names).toContain("get_tenant");
    expect(names).toContain("list_tenants");
    expect(names).toContain("update_tenant");
    expect(names).toContain("delete_tenant");
    expect(names).toContain("get_tenant_by_slug");
    expect(names).toContain("create_dataset");
    expect(names).toContain("get_dataset");
    expect(names).toContain("list_datasets");
    expect(names).toContain("update_dataset");
    expect(names).toContain("delete_dataset");
    expect(names).toContain("create_record");
    expect(names).toContain("get_record");
    expect(names).toContain("list_records");
    expect(names).toContain("count_records");
    expect(names).toContain("delete_record");
    expect(names).toContain("update_record_data");
    expect(names).toContain("delete_records_by_dataset");
    expect(names).toContain("ingest_data");
    expect(names).toContain("process_record");
    expect(names).toContain("search");
    expect(names).toContain("list_entities");
    expect(names).toContain("list_relations");
    expect(names).toContain("create_entity");
    expect(names).toContain("create_relation");
    expect(names).toContain("get_entity");
    expect(names).toContain("get_relation");
    expect(names).toContain("delete_entity");
    expect(names).toContain("delete_relation");
    expect(names).toContain("find_graph_paths");
    expect(names).toContain("get_entity_neighbors");
    expect(names).toContain("delete_entities_by_dataset");
    expect(names).toContain("extract_graph_entities");
  });
});

describe("MCP — tenant tools", () => {
  test("create_tenant creates a tenant", async () => {
    const result = await callTool("create_tenant", {
      name: "MCP Test Org",
      slug: "mcp-test",
      type: "organization",
    });
    expect(result.isError).toBeFalsy();
    const tenant = parseContent(result);
    expect(tenant.id).toMatch(/^tenant_/);
    expect(tenant.name).toBe("MCP Test Org");
    expect(tenant.slug).toBe("mcp-test");
    tenantId = tenant.id;
  });

  test("get_tenant returns tenant by id", async () => {
    const result = await callTool("get_tenant", { id: tenantId });
    expect(result.isError).toBeFalsy();
    const tenant = parseContent(result);
    expect(tenant.id).toBe(tenantId);
    expect(tenant.name).toBe("MCP Test Org");
  });

  test("get_tenant returns error for nonexistent", async () => {
    const result = await callTool("get_tenant", { id: "tenant_nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("list_tenants returns array", async () => {
    const result = await callTool("list_tenants");
    expect(result.isError).toBeFalsy();
    const tenants = parseContent(result);
    expect(Array.isArray(tenants)).toBe(true);
    expect(tenants.some((t: any) => t.id === tenantId)).toBe(true);
  });

  test("update_tenant updates name and type", async () => {
    const result = await callTool("update_tenant", {
      id: tenantId,
      name: "MCP Updated Org",
      type: "team",
    });
    expect(result.isError).toBeFalsy();
    const tenant = parseContent(result);
    expect(tenant.id).toBe(tenantId);
    expect(tenant.name).toBe("MCP Updated Org");
    expect(tenant.type).toBe("team");
  });

  test("update_tenant returns error for nonexistent", async () => {
    const result = await callTool("update_tenant", {
      id: "tenant_nonexistent",
      name: "Nope",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("delete_tenant deletes a tenant", async () => {
    const createResult = await callTool("create_tenant", {
      name: "Delete Me",
      slug: "delete-me",
    });
    const { id } = parseContent(createResult);

    const delResult = await callTool("delete_tenant", { id });
    expect(delResult.isError).toBeFalsy();
    expect(delResult.content[0].text).toBe("Deleted");

    // Verify gone
    const getResult = await callTool("get_tenant", { id });
    expect(getResult.isError).toBe(true);
  });

  test("delete_tenant returns Not found for nonexistent", async () => {
    const result = await callTool("delete_tenant", { id: "tenant_nonexistent" });
    expect(result.content[0].text).toBe("Not found");
  });

  test("get_tenant_by_slug returns tenant by slug", async () => {
    const result = await callTool("get_tenant_by_slug", { slug: "mcp-test" });
    expect(result.isError).toBeFalsy();
    const tenant = parseContent(result);
    expect(tenant.id).toBe(tenantId);
    expect(tenant.slug).toBe("mcp-test");
  });

  test("get_tenant_by_slug returns error for nonexistent", async () => {
    const result = await callTool("get_tenant_by_slug", { slug: "nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });
});

describe("MCP — dataset tools", () => {
  test("create_dataset creates a dataset", async () => {
    const result = await callTool("create_dataset", {
      tenant_id: tenantId,
      name: "MCP DS",
    });
    expect(result.isError).toBeFalsy();
    const ds = parseContent(result);
    expect(ds.id).toMatch(/^ds_/);
    expect(ds.name).toBe("MCP DS");
    datasetId = ds.id;
  });

  test("get_dataset returns dataset by id", async () => {
    const result = await callTool("get_dataset", { id: datasetId });
    expect(result.isError).toBeFalsy();
    const ds = parseContent(result);
    expect(ds.id).toBe(datasetId);
    expect(ds.name).toBe("MCP DS");
  });

  test("get_dataset returns error for nonexistent", async () => {
    const result = await callTool("get_dataset", { id: "ds_nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("list_datasets returns array for tenant", async () => {
    const result = await callTool("list_datasets", { tenant_id: tenantId });
    expect(result.isError).toBeFalsy();
    const datasets = parseContent(result);
    expect(Array.isArray(datasets)).toBe(true);
    expect(datasets.some((d: any) => d.id === datasetId)).toBe(true);
  });

  test("create_dataset with optional fields", async () => {
    const result = await callTool("create_dataset", {
      tenant_id: tenantId,
      name: "MCP DS Full",
      description: "A test dataset",
      source_type: "api",
      vectors_enabled: true,
      graph_enabled: true,
    });
    expect(result.isError).toBeFalsy();
    const ds = parseContent(result);
    expect(ds.id).toMatch(/^ds_/);
    expect(ds.description).toBe("A test dataset");
  });

  test("update_dataset updates name and description", async () => {
    const result = await callTool("update_dataset", {
      id: datasetId,
      name: "MCP DS Updated",
      description: "Updated description",
    });
    expect(result.isError).toBeFalsy();
    const ds = parseContent(result);
    expect(ds.id).toBe(datasetId);
    expect(ds.name).toBe("MCP DS Updated");
    expect(ds.description).toBe("Updated description");
  });

  test("update_dataset returns error for nonexistent", async () => {
    const result = await callTool("update_dataset", {
      id: "ds_nonexistent",
      name: "Nope",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("delete_dataset deletes a dataset", async () => {
    const createResult = await callTool("create_dataset", {
      tenant_id: tenantId,
      name: "Delete DS",
    });
    const { id } = parseContent(createResult);

    const delResult = await callTool("delete_dataset", { id });
    expect(delResult.content[0].text).toBe("Deleted");

    const getResult = await callTool("get_dataset", { id });
    expect(getResult.isError).toBe(true);
  });

  test("delete_dataset returns Not found for nonexistent", async () => {
    const result = await callTool("delete_dataset", { id: "ds_nonexistent" });
    expect(result.content[0].text).toBe("Not found");
  });
});

describe("MCP — record tools", () => {
  test("get_record returns error for nonexistent", async () => {
    const result = await callTool("get_record", { id: "rec_nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("list_records returns array", async () => {
    const result = await callTool("list_records", { dataset_id: datasetId });
    expect(result.isError).toBeFalsy();
    const records = parseContent(result);
    expect(Array.isArray(records)).toBe(true);
  });

  test("count_records returns counts (empty for no records)", async () => {
    const result = await callTool("count_records", { dataset_id: datasetId });
    expect(result.isError).toBeFalsy();
    const counts = parseContent(result);
    expect(typeof counts).toBe("object");
  });
});

describe("MCP — ingest tool", () => {
  let recordId: string;

  test("ingest_data creates a pending record", async () => {
    const result = await callTool("ingest_data", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      source: "api",
      data: { text: "hello from mcp test" },
      auto_process: false,
    });
    expect(result.isError).toBeFalsy();
    const data = parseContent(result);
    expect(data.status).toBe("pending");
    expect(data.record_id).toMatch(/^rec_/);
    recordId = data.record_id;
  });

  test("ingest_data returns error for nonexistent dataset", async () => {
    const result = await callTool("ingest_data", {
      tenant_id: tenantId,
      dataset_id: "ds_nonexistent",
      data: { text: "nope" },
      auto_process: false,
    });
    expect(result.isError).toBeFalsy(); // tool itself doesn't error, result has error status
    const data = parseContent(result);
    expect(data.status).toBe("error");
    expect(data.message).toContain("not found");
  });
});

describe("MCP — records after ingest", () => {
  let recordId: string;

  test("list_records shows ingested record", async () => {
    const ingestResult = await callTool("ingest_data", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      data: { text: "listed record" },
      auto_process: false,
    });
    recordId = parseContent(ingestResult).record_id;

    const result = await callTool("list_records", { dataset_id: datasetId });
    const records = parseContent(result);
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records.some((r: any) => r.id === recordId)).toBe(true);
  });

  test("get_record returns record by id", async () => {
    const result = await callTool("get_record", { id: recordId });
    expect(result.isError).toBeFalsy();
    const record = parseContent(result);
    expect(record.id).toBe(recordId);
    expect(record.status).toBe("pending");
  });

  test("count_records shows pending count", async () => {
    const result = await callTool("count_records", { dataset_id: datasetId });
    const counts = parseContent(result);
    expect(counts.pending).toBeGreaterThanOrEqual(1);
  });

  test("delete_record deletes a record", async () => {
    const ingestResult = await callTool("ingest_data", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      data: { text: "to be deleted" },
      auto_process: false,
    });
    const recId = parseContent(ingestResult).record_id;

    const delResult = await callTool("delete_record", { id: recId });
    expect(delResult.content[0].text).toBe("Deleted");

    const getResult = await callTool("get_record", { id: recId });
    expect(getResult.isError).toBe(true);
  });

  test("delete_record returns Not found for nonexistent", async () => {
    const result = await callTool("delete_record", { id: "rec_nonexistent" });
    expect(result.content[0].text).toBe("Not found");
  });
});

describe("MCP — graph tools", () => {
  test("list_entities returns empty list", async () => {
    const result = await callTool("list_entities", { dataset_id: datasetId });
    expect(result.isError).toBeFalsy();
    const entities = parseContent(result);
    expect(entities).toEqual([]);
  });

  test("list_relations returns empty list", async () => {
    const result = await callTool("list_relations", { dataset_id: datasetId });
    expect(result.isError).toBeFalsy();
    const relations = parseContent(result);
    expect(relations).toEqual([]);
  });

  test("list_entities with type filter", async () => {
    const result = await callTool("list_entities", {
      dataset_id: datasetId,
      type: "person",
      limit: 10,
    });
    expect(result.isError).toBeFalsy();
    const entities = parseContent(result);
    expect(Array.isArray(entities)).toBe(true);
  });

  test("list_relations with limit", async () => {
    const result = await callTool("list_relations", {
      dataset_id: datasetId,
      limit: 10,
    });
    expect(result.isError).toBeFalsy();
    const relations = parseContent(result);
    expect(Array.isArray(relations)).toBe(true);
  });

  let entityId: string;
  let relationId: string;

  test("create_entity creates an entity", async () => {
    const result = await callTool("create_entity", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "Alice",
      properties: { role: "engineer" },
    });
    expect(result.isError).toBeFalsy();
    const entity = parseContent(result);
    expect(entity.id).toMatch(/^ent_/);
    expect(entity.type).toBe("person");
    expect(entity.name).toBe("Alice");
    entityId = entity.id;
  });

  test("create_relation creates a relation", async () => {
    // Create second entity
    const ent2Result = await callTool("create_entity", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "Bob",
    });
    const ent2 = parseContent(ent2Result);

    const result = await callTool("create_relation", {
      tenant_id: tenantId,
      type: "works_with",
      source_entity_id: entityId,
      target_entity_id: ent2.id,
      weight: 0.8,
    });
    expect(result.isError).toBeFalsy();
    const relation = parseContent(result);
    expect(relation.id).toMatch(/^rel_/);
    expect(relation.type).toBe("works_with");
    expect(relation.source_entity_id).toBe(entityId);
    expect(relation.target_entity_id).toBe(ent2.id);
    relationId = relation.id;
  });

  test("get_entity returns entity by id", async () => {
    const result = await callTool("get_entity", { id: entityId });
    expect(result.isError).toBeFalsy();
    const entity = parseContent(result);
    expect(entity.id).toBe(entityId);
    expect(entity.name).toBe("Alice");
  });

  test("get_entity returns error for nonexistent", async () => {
    const result = await callTool("get_entity", { id: "ent_nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("get_relation returns relation by id", async () => {
    const result = await callTool("get_relation", { id: relationId });
    expect(result.isError).toBeFalsy();
    const relation = parseContent(result);
    expect(relation.id).toBe(relationId);
    expect(relation.type).toBe("works_with");
  });

  test("get_relation returns error for nonexistent", async () => {
    const result = await callTool("get_relation", { id: "rel_nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("list_entities shows created entity", async () => {
    const result = await callTool("list_entities", { dataset_id: datasetId });
    expect(result.isError).toBeFalsy();
    const entities = parseContent(result);
    expect(entities.length).toBeGreaterThanOrEqual(2);
    expect(entities.some((e: any) => e.id === entityId)).toBe(true);
  });

  test("delete_entity deletes an entity", async () => {
    const createResult = await callTool("create_entity", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "concept",
      name: "ToDelete",
    });
    const { id } = parseContent(createResult);

    const delResult = await callTool("delete_entity", { id });
    expect(delResult.content[0].text).toBe("Deleted");
  });

  test("delete_entity returns Not found for nonexistent", async () => {
    const result = await callTool("delete_entity", { id: "ent_nonexistent" });
    expect(result.content[0].text).toBe("Not found");
  });

  test("delete_relation deletes a relation", async () => {
    const ent1Result = await callTool("create_entity", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DelRelSrc",
    });
    const ent1 = parseContent(ent1Result);

    const ent2Result = await callTool("create_entity", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DelRelTgt",
    });
    const ent2 = parseContent(ent2Result);

    const createResult = await callTool("create_relation", {
      tenant_id: tenantId,
      type: "removes",
      source_entity_id: ent1.id,
      target_entity_id: ent2.id,
    });
    const { id } = parseContent(createResult);

    const delResult = await callTool("delete_relation", { id });
    expect(delResult.content[0].text).toBe("Deleted");
  });

  test("delete_relation returns Not found for nonexistent", async () => {
    const result = await callTool("delete_relation", { id: "rel_nonexistent" });
    expect(result.content[0].text).toBe("Not found");
  });
});

describe("MCP — search tool", () => {
  test("search with vector type returns response structure", async () => {
    const result = await callTool("search", {
      tenant_id: tenantId,
      query: "hello",
      search_type: "vector",
    });
    expect(result.isError).toBeFalsy();
    const data = parseContent(result);
    expect(data).toHaveProperty("records");
    expect(data).toHaveProperty("total");
    // Without an OpenAI API key, vector search gracefully returns an error field
    if (data.error) {
      expect(data.records).toEqual([]);
      expect(data.total).toBe(0);
    }
  });

  test("search with graph type returns response structure", async () => {
    const result = await callTool("search", {
      tenant_id: tenantId,
      query: "test",
      search_type: "graph",
    });
    expect(result.isError).toBeFalsy();
    const data = parseContent(result);
    expect(data).toHaveProperty("records");
  });
});

describe("MCP — delete_entities_by_dataset", () => {
  test("deletes all entities for a dataset", async () => {
    // Create some entities first
    await callTool("create_entity", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DeleteMe1",
    });
    await callTool("create_entity", {
      tenant_id: tenantId,
      dataset_id: datasetId,
      type: "person",
      name: "DeleteMe2",
    });

    const result = await callTool("delete_entities_by_dataset", {
      dataset_id: datasetId,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toMatch(/Deleted \d+ entities/);

    // Verify entities are gone
    const listResult = await callTool("list_entities", { dataset_id: datasetId });
    const entities = parseContent(listResult);
    expect(entities.some((e: any) => e.name === "DeleteMe1")).toBe(false);
    expect(entities.some((e: any) => e.name === "DeleteMe2")).toBe(false);
  });
});

describe("MCP — extract_graph_entities", () => {
  test("returns graceful result when OpenAI key is missing", async () => {
    // OPENAI_API_KEY is empty in the MCP test env — should not crash, return empty arrays
    const result = await callTool("extract_graph_entities", {
      data: { company: "Acme Corp", ceo: "John Doe", founded: 2020 },
      entity_types: ["person", "organization"],
      relation_types: ["ceo_of", "founded"],
    });
    const data = parseContent(result);
    expect(data).toHaveProperty("entities");
    expect(data).toHaveProperty("relations");
    expect(Array.isArray(data.entities)).toBe(true);
    expect(Array.isArray(data.relations)).toBe(true);
  });
});
