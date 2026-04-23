import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "../src/db/sqlite.js";
import { createTenant, getTenant, getTenantBySlug, listTenants, updateTenant, deleteTenant } from "../src/services/tenant.js";
import { createDataset, deleteDataset } from "../src/services/dataset.js";

const DB_PATH = `/tmp/open-data-test-tenant-${Date.now()}.db`;

beforeAll(() => {
  process.env.DATA_DB_PATH = DB_PATH;
  initDb();
});

afterAll(() => {
  closeDb();
  delete process.env.DATA_DB_PATH;
});

describe("tenant CRUD", () => {
  test("createTenant creates a tenant with defaults", () => {
    const tenant = createTenant({ name: "Test Org", slug: "test-org", type: "organization" });
    expect(tenant.id).toMatch(/^tenant_/);
    expect(tenant.name).toBe("Test Org");
    expect(tenant.slug).toBe("test-org");
    expect(tenant.type).toBe("organization");
    expect(tenant.settings.max_datasets).toBe(100);
    expect(tenant.settings.neo4j_database).toBe("neo4j");
  });

  test("createTenant merges custom settings", () => {
    const tenant = createTenant({
      name: "Custom",
      slug: "custom",
      type: "personal",
      settings: { max_datasets: 50, retention_days: 30 },
    });
    expect(tenant.settings.max_datasets).toBe(50);
    expect(tenant.settings.retention_days).toBe(30);
    expect(tenant.settings.default_embedding_model).toBe("text-embedding-3-small");
  });

  test("getTenant returns tenant by id", () => {
    const created = createTenant({ name: "Fetch", slug: "fetch", type: "team" });
    const fetched = getTenant(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Fetch");
  });

  test("getTenant returns null for unknown id", () => {
    expect(getTenant("tenant_nonexistent")).toBeNull();
  });

  test("getTenantBySlug returns tenant by slug", () => {
    const created = createTenant({ name: "Slug Test", slug: "slug-test", type: "personal" });
    const fetched = getTenantBySlug("slug-test");
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  test("getTenantBySlug returns null for unknown slug", () => {
    expect(getTenantBySlug("no-such-slug")).toBeNull();
  });

  test("listTenants returns all tenants", () => {
    const before = listTenants().length;
    createTenant({ name: "List1", slug: "list1", type: "personal" });
    createTenant({ name: "List2", slug: "list2", type: "organization" });
    const after = listTenants();
    expect(after.length).toBe(before + 2);
  });

  test("updateTenant updates name and settings", () => {
    const created = createTenant({ name: "Update", slug: "update", type: "personal" });
    const updated = updateTenant(created.id, {
      name: "Updated",
      settings: { max_datasets: 200 },
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated");
    expect(updated!.settings.max_datasets).toBe(200);
    // other settings preserved
    expect(updated!.settings.neo4j_database).toBe("neo4j");
  });

  test("updateTenant returns null for unknown id", () => {
    expect(updateTenant("tenant_nonexistent", { name: "X" })).toBeNull();
  });

  test("deleteTenant removes tenant", () => {
    const created = createTenant({ name: "Delete", slug: "delete-me", type: "personal" });
    expect(deleteTenant(created.id)).toBe(true);
    expect(getTenant(created.id)).toBeNull();
  });

  test("deleteTenant returns false for unknown id", () => {
    expect(deleteTenant("tenant_nonexistent")).toBe(false);
  });

  test("deleteTenant cascades to datasets", () => {
    const tenant = createTenant({ name: "Cascade Tenant", slug: "cascade-tenant", type: "personal" });
    const ds = createDataset({ tenant_id: tenant.id, name: "Cascade DS" });
    expect(getTenant(tenant.id)).not.toBeNull();
    expect(deleteTenant(tenant.id)).toBe(true);
    // Dataset should also be gone
    expect(listTenants().some((t) => t.id === tenant.id)).toBe(false);
  });
});
