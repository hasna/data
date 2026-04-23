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
  updateEntity,
  updateRelation,
} from "../src/services/graph.js";
import { OpenData } from "../src/sdk/index.js";

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

describe("entity update", () => {
  test("updateEntity updates type", () => {
    const ent = createEntity(tenantId, datasetId, "person", "UpdateTypeTest");
    const updated = updateEntity(ent.id, { type: "developer" });
    expect(updated).not.toBeNull();
    expect(updated!.type).toBe("developer");
    expect(updated!.name).toBe("UpdateTypeTest");
  });

  test("updateEntity updates name", () => {
    const ent = createEntity(tenantId, datasetId, "person", "OldName");
    const updated = updateEntity(ent.id, { name: "NewName" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("NewName");
  });

  test("updateEntity updates properties", () => {
    const ent = createEntity(tenantId, datasetId, "concept", "PropsTest");
    const updated = updateEntity(ent.id, { properties: { level: 5, active: true } });
    expect(updated).not.toBeNull();
    expect(updated!.properties).toEqual({ level: 5, active: true });
  });

  test("updateEntity returns null for unknown id", () => {
    expect(updateEntity("ent_unknown", { type: "x" })).toBeNull();
  });

  test("updateEntity returns existing entity when no fields provided", () => {
    const ent = createEntity(tenantId, datasetId, "person", "NoUpdateTest");
    const updated = updateEntity(ent.id, {});
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(ent.id);
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

describe("relation update", () => {
  test("updateRelation updates type", () => {
    const s = createEntity(tenantId, datasetId, "person", "RelUpdTypeSrc");
    const t = createEntity(tenantId, datasetId, "concept", "RelUpdTypeTgt");
    const rel = createRelation(tenantId, "old_type", s.id, t.id);
    const updated = updateRelation(rel.id, { type: "new_type" });
    expect(updated).not.toBeNull();
    expect(updated!.type).toBe("new_type");
  });

  test("updateRelation updates weight", () => {
    const s = createEntity(tenantId, datasetId, "person", "RelUpdWeightSrc");
    const t = createEntity(tenantId, datasetId, "concept", "RelUpdWeightTgt");
    const rel = createRelation(tenantId, "weighted", s.id, t.id, 0.5);
    const updated = updateRelation(rel.id, { weight: 0.9 });
    expect(updated).not.toBeNull();
    expect(updated!.weight).toBe(0.9);
  });

  test("updateRelation updates properties", () => {
    const s = createEntity(tenantId, datasetId, "person", "RelUpdPropSrc");
    const t = createEntity(tenantId, datasetId, "concept", "RelUpdPropTgt");
    const rel = createRelation(tenantId, "prop_rel", s.id, t.id);
    const updated = updateRelation(rel.id, { properties: { reason: "test" } });
    expect(updated).not.toBeNull();
    expect(updated!.properties).toEqual({ reason: "test" });
  });

  test("updateRelation returns null for unknown id", () => {
    expect(updateRelation("rel_unknown", { type: "x" })).toBeNull();
  });
});

describe("entity deletion", () => {
  test("deleteEntity cascades to relations", async () => {
    const s = createEntity(tenantId, datasetId, "person", "CascadeSrc");
    const t = createEntity(tenantId, datasetId, "concept", "CascadeTgt");
    const rel = createRelation(tenantId, "authored", s.id, t.id);

    // Relation exists
    expect(getRelation(rel.id)).not.toBeNull();

    // Delete source entity
    expect(await deleteEntity(s.id)).toBe(true);
    expect(getEntity(s.id)).toBeNull();

    // Relation should be gone too
    expect(getRelation(rel.id)).toBeNull();
    // Target entity still exists
    expect(getEntity(t.id)).not.toBeNull();
  });

  test("deleteEntity returns false for unknown id", async () => {
    expect(await deleteEntity("ent_nonexistent")).toBe(false);
  });

  test("deleteEntitiesByDataset removes all entities and relations", async () => {
    const ds2 = createDataset({ tenant_id: tenantId, name: "Del Graph DS" });
    const s = createEntity(tenantId, ds2.id, "person", "DelSrc");
    const t = createEntity(tenantId, ds2.id, "concept", "DelTgt");
    createRelation(tenantId, "related_to", s.id, t.id);

    const deleted = await deleteEntitiesByDataset(ds2.id);
    expect(deleted).toBe(2);
    expect(listEntities(ds2.id).length).toBe(0);
  });
});

describe("listEntities offset", () => {
  test("listEntities with offset skips first N results", () => {
    const ds3 = createDataset({ tenant_id: tenantId, name: "Offset DS" });
    createEntity(tenantId, ds3.id, "person", "Offset1");
    createEntity(tenantId, ds3.id, "person", "Offset2");
    createEntity(tenantId, ds3.id, "person", "Offset3");
    createEntity(tenantId, ds3.id, "person", "Offset4");

    const all = listEntities(ds3.id, "person");
    expect(all.length).toBe(4);

    const page1 = listEntities(ds3.id, "person", 2, 0);
    const page2 = listEntities(ds3.id, "person", 2, 2);

    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    // Pages should have different entities
    expect(page1[0].name).not.toBe(page2[0].name);
  });

  test("listEntities with offset beyond results returns empty", () => {
    const ds4 = createDataset({ tenant_id: tenantId, name: "Offset Empty DS" });
    createEntity(tenantId, ds4.id, "person", "OnlyOne");
    const result = listEntities(ds4.id, "person", 10, 5);
    expect(result.length).toBe(0);
  });
});

describe("listRelations offset", () => {
  test("listRelations with offset skips first N results", () => {
    const ds5 = createDataset({ tenant_id: tenantId, name: "RelOffset DS" });
    const s = createEntity(tenantId, ds5.id, "person", "RelOffSrc");
    const t1 = createEntity(tenantId, ds5.id, "concept", "RelOffTgt1");
    const t2 = createEntity(tenantId, ds5.id, "concept", "RelOffTgt2");
    const t3 = createEntity(tenantId, ds5.id, "concept", "RelOffTgt3");
    createRelation(tenantId, "rel1", s.id, t1.id);
    createRelation(tenantId, "rel2", s.id, t2.id);
    createRelation(tenantId, "rel3", s.id, t3.id);

    const all = listRelations(ds5.id);
    expect(all.length).toBeGreaterThanOrEqual(3);

    const page1 = listRelations(ds5.id, 2, 0);
    const page2 = listRelations(ds5.id, 2, 2);

    expect(page1.length).toBe(2);
    // If there are enough relations, page2 should have at least 1
    if (all.length >= 3) {
      expect(page2.length).toBeGreaterThanOrEqual(1);
      expect(page1[0].type).not.toBe(page2[0].type);
    }
  });
});

describe("SDK findEntityByName", () => {
  test("graph.findByEntityName finds entity by name", () => {
    const client = new OpenData();
    const found = client.graph.findByEntityName(tenantId, "Alice");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Alice");
    expect(found!.type).toBe("person");
    client.close();
  });

  test("graph.findByEntityName with type filter", () => {
    const client = new OpenData();
    // "TypedFind" exists as both "person" and "concept"
    const person = client.graph.findByEntityName(tenantId, "TypedFind", "person");
    expect(person).not.toBeNull();
    expect(person!.type).toBe("person");
    const concept = client.graph.findByEntityName(tenantId, "TypedFind", "concept");
    expect(concept).not.toBeNull();
    expect(concept!.type).toBe("concept");
    client.close();
  });
});
