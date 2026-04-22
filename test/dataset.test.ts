import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "../src/db/sqlite.js";
import { createTenant } from "../src/services/tenant.js";
import {
  createDataset,
  getDataset,
  listDatasets,
  updateDataset,
  deleteDataset,
  incrementRecordCount,
} from "../src/services/dataset.js";

const DB_PATH = `/tmp/open-data-test-dataset-${Date.now()}.db`;
let tenantId: string;

beforeAll(() => {
  process.env.DATA_DB_PATH = DB_PATH;
  initDb();
  const tenant = createTenant({ name: "DS Test", slug: "ds-test", type: "organization" });
  tenantId = tenant.id;
});

afterAll(() => {
  closeDb();
  delete process.env.DATA_DB_PATH;
});

describe("dataset CRUD", () => {
  test("createDataset with defaults", () => {
    const ds = createDataset({ tenant_id: tenantId, name: "Test Dataset" });
    expect(ds.id).toMatch(/^ds_/);
    expect(ds.name).toBe("Test Dataset");
    expect(ds.description).toBe("");
    expect(ds.schema.fields).toEqual([]);
    expect(ds.schema.strict).toBe(false);
    expect(ds.source_type).toBe("manual");
    expect(ds.record_count).toBe(0);
  });

  test("createDataset with full config", () => {
    const ds = createDataset({
      tenant_id: tenantId,
      name: "Full Dataset",
      description: "A test dataset",
      schema: {
        fields: [{ name: "title", type: "string", required: true }],
        strict: true,
      },
      source_type: "api",
      vector_config: { enabled: true, model: "text-embedding-v3", dimensions: 1024, auto_embed: false },
      graph_config: { enabled: false, auto_extract: false, entity_types: ["person"], relation_types: ["knows"] },
    });
    expect(ds.description).toBe("A test dataset");
    expect(ds.schema.fields.length).toBe(1);
    expect(ds.schema.strict).toBe(true);
    expect(ds.source_type).toBe("api");
    expect(ds.vector_config.model).toBe("text-embedding-v3");
    expect(ds.vector_config.auto_embed).toBe(false);
    expect(ds.graph_config.enabled).toBe(false);
  });

  test("getDataset returns dataset by id", () => {
    const created = createDataset({ tenant_id: tenantId, name: "Fetch DS" });
    const fetched = getDataset(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Fetch DS");
  });

  test("getDataset returns null for unknown id", () => {
    expect(getDataset("ds_nonexistent")).toBeNull();
  });

  test("listDatasets returns datasets for tenant", () => {
    createDataset({ tenant_id: tenantId, name: "List1" });
    createDataset({ tenant_id: tenantId, name: "List2" });
    const list = listDatasets(tenantId);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  test("updateDataset updates name and description", () => {
    const created = createDataset({ tenant_id: tenantId, name: "Old Name" });
    const updated = updateDataset(created.id, { name: "New Name", description: "Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New Name");
    expect(updated!.description).toBe("Updated");
  });

  test("updateDataset merges vector_config", () => {
    const created = createDataset({ tenant_id: tenantId, name: "Config Merge" });
    const updated = updateDataset(created.id, {
      vector_config: { dimensions: 768 },
    });
    expect(updated).not.toBeNull();
    expect(updated!.vector_config.dimensions).toBe(768);
    expect(updated!.vector_config.model).toBe("text-embedding-3-small");
  });

  test("updateDataset returns null for unknown id", () => {
    expect(updateDataset("ds_nonexistent", { name: "X" })).toBeNull();
  });

  test("incrementRecordCount increments count", () => {
    const created = createDataset({ tenant_id: tenantId, name: "Count DS" });
    expect(created.record_count).toBe(0);
    incrementRecordCount(created.id);
    incrementRecordCount(created.id, 5);
    const fetched = getDataset(created.id);
    expect(fetched!.record_count).toBe(6);
  });

  test("deleteDataset removes dataset", () => {
    const created = createDataset({ tenant_id: tenantId, name: "Delete DS" });
    expect(deleteDataset(created.id)).toBe(true);
    expect(getDataset(created.id)).toBeNull();
  });

  test("deleteDataset returns false for unknown id", () => {
    expect(deleteDataset("ds_nonexistent")).toBe(false);
  });
});
