import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { initDb, closeDb } from "../src/db/sqlite.js";
import { createTenant } from "../src/services/tenant.js";
import { createDataset } from "../src/services/dataset.js";
import {
  createEntity,
  getEntity,
  listEntities,
  findEntityByName,
  createRelation,
  getRelation,
  listRelations,
  deleteEntity,
  deleteEntitiesByDataset,
} from "../src/services/graph.js";

const DB_PATH = `/tmp/open-data-test-graph-${Date.now()}.db`;
let tenantId: string;
let datasetId: string;

beforeAll(() => {
  process.env.DATA_DB_PATH = DB_PATH;
  initDb();
  const tenant = createTenant({ name: "Graph Test", slug: "graph-test", type: "organization" });
  tenantId = tenant.id;
  const ds = createDataset({ tenant_id: tenantId, name: "Graph DS" });
  datasetId = ds.id;
});

afterAll(() => {
  closeDb();
  delete process.env.DATA_DB_PATH;
});

describe("entity CRUD", () => {
  test("createEntity creates entity with defaults", () => {
    const ent = createEntity(tenantId, datasetId, "person", "Alice");
    expect(ent.id).toMatch(/^ent_/);
    expect(ent.tenant_id).toBe(tenantId);
    expect(ent.dataset_id).toBe(datasetId);
    expect(ent.type).toBe("person");
    expect(ent.name).toBe("Alice");
    expect(ent.properties).toEqual({});
  });

  test("createEntity stores properties", () => {
    const ent = createEntity(tenantId, datasetId, "concept", "React", { category: "framework", version: 18 });
    expect(ent.properties).toEqual({ category: "framework", version: 18 });
  });

  test("getEntity returns entity by id", () => {
    const created = createEntity(tenantId, datasetId, "person", "Bob");
    const fetched = getEntity(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Bob");
  });

  test("getEntity returns null for unknown id", () => {
    expect(getEntity("ent_nonexistent")).toBeNull();
  });

  test("listEntities returns entities for dataset", () => {
    createEntity(tenantId, datasetId, "person", "List1");
    createEntity(tenantId, datasetId, "concept", "List2");
    const list = listEntities(datasetId);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  test("listEntities filters by type", () => {
    createEntity(tenantId, datasetId, "person", "TypeFilter");
    createEntity(tenantId, datasetId, "concept", "TypeFilterConcept");
    const people = listEntities(datasetId, "person");
    const concepts = listEntities(datasetId, "concept");
    expect(people.every((e) => e.type === "person")).toBe(true);
    expect(concepts.every((e) => e.type === "concept")).toBe(true);
  });

  test("findEntityByName finds by name and tenant", () => {
    createEntity(tenantId, datasetId, "person", "UniqueFindName");
    const found = findEntityByName(tenantId, "UniqueFindName");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("UniqueFindName");
  });

  test("findEntityByName filters by type", () => {
    createEntity(tenantId, datasetId, "person", "TypedFind");
    createEntity(tenantId, datasetId, "concept", "TypedFind");
    const person = findEntityByName(tenantId, "TypedFind", "person");
    expect(person).not.toBeNull();
    expect(person!.type).toBe("person");
  });

  test("findEntityByName returns null for unknown name", () => {
    expect(findEntityByName(tenantId, "NoSuchEntity")).toBeNull();
  });
});

describe("relation CRUD", () => {
  test("createRelation links two entities", () => {
    const source = createEntity(tenantId, datasetId, "person", "RelSrc");
    const target = createEntity(tenantId, datasetId, "concept", "RelTgt");
    const rel = createRelation(tenantId, "references", source.id, target.id, 0.8, { context: "test" });
    expect(rel.id).toMatch(/^rel_/);
    expect(rel.type).toBe("references");
    expect(rel.source_entity_id).toBe(source.id);
    expect(rel.target_entity_id).toBe(target.id);
    expect(rel.weight).toBe(0.8);
    expect(rel.properties).toEqual({ context: "test" });
  });

  test("getRelation returns relation by id", () => {
    const s = createEntity(tenantId, datasetId, "person", "GetRelSrc");
    const t = createEntity(tenantId, datasetId, "concept", "GetRelTgt");
    const created = createRelation(tenantId, "depends_on", s.id, t.id);
    const fetched = getRelation(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.type).toBe("depends_on");
  });

  test("getRelation returns null for unknown id", () => {
    expect(getRelation("rel_nonexistent")).toBeNull();
  });

  test("listRelations returns relations for dataset", () => {
    const s = createEntity(tenantId, datasetId, "person", "ListRelSrc");
    const t = createEntity(tenantId, datasetId, "concept", "ListRelTgt");
    createRelation(tenantId, "mentions", s.id, t.id);
    const list = listRelations(datasetId);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});

describe("entity deletion", () => {
  test("deleteEntity cascades to relations", () => {
    const s = createEntity(tenantId, datasetId, "person", "CascadeSrc");
    const t = createEntity(tenantId, datasetId, "concept", "CascadeTgt");
    const rel = createRelation(tenantId, "authored", s.id, t.id);

    // Relation exists
    expect(getRelation(rel.id)).not.toBeNull();

    // Delete source entity
    expect(deleteEntity(s.id)).toBe(true);
    expect(getEntity(s.id)).toBeNull();

    // Relation should be gone too
    expect(getRelation(rel.id)).toBeNull();
    // Target entity still exists
    expect(getEntity(t.id)).not.toBeNull();
  });

  test("deleteEntity returns false for unknown id", () => {
    expect(deleteEntity("ent_nonexistent")).toBe(false);
  });

  test("deleteEntitiesByDataset removes all entities and relations", () => {
    const ds2 = createDataset({ tenant_id: tenantId, name: "Del Graph DS" });
    const s = createEntity(tenantId, ds2.id, "person", "DelSrc");
    const t = createEntity(tenantId, ds2.id, "concept", "DelTgt");
    createRelation(tenantId, "related_to", s.id, t.id);

    const deleted = deleteEntitiesByDataset(ds2.id);
    expect(deleted).toBe(2);
    expect(listEntities(ds2.id).length).toBe(0);
  });
});
