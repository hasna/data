import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "../src/db/sqlite.js";
import { createTenant } from "../src/services/tenant.js";
import { createDataset } from "../src/services/dataset.js";
import {
  createRecord,
  getRecord,
  listRecords,
  updateRecordStatus,
  updateRecordData,
  updateRecordVector,
  deleteRecord,
  deleteRecordsByDataset,
  countRecordsByStatus,
} from "../src/services/record.js";

const DB_PATH = `/tmp/open-data-test-record-${Date.now()}.db`;
let tenantId: string;
let datasetId: string;

beforeAll(() => {
  process.env.DATA_DB_PATH = DB_PATH;
  initDb();
  const tenant = createTenant({ name: "Rec Test", slug: "rec-test", type: "organization" });
  tenantId = tenant.id;
  const ds = createDataset({ tenant_id: tenantId, name: "Rec Dataset" });
  datasetId = ds.id;
});

afterAll(() => {
  closeDb();
  delete process.env.DATA_DB_PATH;
});

describe("record CRUD", () => {
  test("createRecord creates a pending record", () => {
    const rec = createRecord(datasetId, tenantId, { title: "Hello", value: 42 });
    expect(rec.id).toMatch(/^rec_/);
    expect(rec.dataset_id).toBe(datasetId);
    expect(rec.tenant_id).toBe(tenantId);
    expect(rec.data.title).toBe("Hello");
    expect(rec.data.value).toBe(42);
    expect(rec.status).toBe("pending");
    expect(rec.vector).toBeUndefined();
  });

  test("createRecord stores raw_data", () => {
    const rec = createRecord(datasetId, tenantId, { title: "Raw" }, { original: "data" });
    expect(rec.raw_data).toEqual({ original: "data" });
  });

  test("getRecord returns record by id", () => {
    const created = createRecord(datasetId, tenantId, { title: "Fetch" });
    const fetched = getRecord(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.data.title).toBe("Fetch");
  });

  test("getRecord returns null for unknown id", () => {
    expect(getRecord("rec_nonexistent")).toBeNull();
  });

  test("listRecords returns records for dataset", () => {
    createRecord(datasetId, tenantId, { idx: 1 });
    createRecord(datasetId, tenantId, { idx: 2 });
    const list = listRecords(datasetId);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  test("listRecords filters by status", () => {
    const rec = createRecord(datasetId, tenantId, { status_test: true });
    updateRecordStatus(rec.id, "structured");
    const pending = listRecords(datasetId, "pending");
    const structured = listRecords(datasetId, "structured");
    expect(pending.every((r) => r.status === "pending")).toBe(true);
    expect(structured.every((r) => r.status === "structured")).toBe(true);
  });

  test("updateRecordStatus changes status", () => {
    const rec = createRecord(datasetId, tenantId, { s: 1 });
    const updated = updateRecordStatus(rec.id, "vectorized");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("vectorized");
  });

  test("updateRecordStatus stores error", () => {
    const rec = createRecord(datasetId, tenantId, { s: 2 });
    const updated = updateRecordStatus(rec.id, "error", "something failed");
    expect(updated!.status).toBe("error");
    expect(updated!.error).toBe("something failed");
  });

  test("updateRecordData replaces data", () => {
    const rec = createRecord(datasetId, tenantId, { old: "data" });
    const updated = updateRecordData(rec.id, { new: "data" });
    expect(updated).not.toBeNull();
    expect(updated!.data).toEqual({ new: "data" });
    expect((updated!.data as any).old).toBeUndefined();
  });

  test("updateRecordVector stores and retrieves vector", () => {
    const rec = createRecord(datasetId, tenantId, { vec: true });
    const vector = [0.1, 0.2, 0.3, 0.4, 0.5];
    updateRecordVector(rec.id, vector);
    const fetched = getRecord(rec.id);
    expect(fetched!.vector).toBeDefined();
    expect(fetched!.vector!.length).toBe(5);
    expect(fetched!.vector![0]).toBeCloseTo(0.1, 5);
    expect(fetched!.vector![4]).toBeCloseTo(0.5, 5);
  });

  test("deleteRecord removes record", () => {
    const rec = createRecord(datasetId, tenantId, { del: true });
    expect(deleteRecord(rec.id)).toBe(true);
    expect(getRecord(rec.id)).toBeNull();
  });

  test("deleteRecord returns false for unknown id", () => {
    expect(deleteRecord("rec_nonexistent")).toBe(false);
  });

  test("deleteRecordsByDataset removes all records", () => {
    const ds2 = createDataset({ tenant_id: tenantId, name: "Del DS" });
    createRecord(ds2.id, tenantId, { x: 1 });
    createRecord(ds2.id, tenantId, { x: 2 });
    const deleted = deleteRecordsByDataset(ds2.id);
    expect(deleted).toBe(2);
    expect(listRecords(ds2.id).length).toBe(0);
  });

  test("countRecordsByStatus groups by status", () => {
    const ds3 = createDataset({ tenant_id: tenantId, name: "Count DS" });
    const r1 = createRecord(ds3.id, tenantId, { c: 1 });
    const r2 = createRecord(ds3.id, tenantId, { c: 2 });
    createRecord(ds3.id, tenantId, { c: 3 });
    updateRecordStatus(r1.id, "structured");
    updateRecordStatus(r2.id, "complete");
    const counts = countRecordsByStatus(ds3.id);
    expect(counts["pending"]).toBe(1);
    expect(counts["structured"]).toBe(1);
    expect(counts["complete"]).toBe(1);
  });
});
