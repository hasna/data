import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { getDb } from "../db/sqlite.js";
import { getNeo4jDriver, runCypher, runInTransaction } from "../db/neo4j.js";
import { getConfig } from "../utils/config.js";
import { resolveChatModel } from "../utils/model.js";
import { Entity, Relation, GraphExtractRequest, GraphExtractResult } from "../types.js";

// --- SQLite Entity/Relation CRUD ---

function rowToEntity(row: any): Entity {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    dataset_id: row.dataset_id,
    type: row.type,
    name: row.name,
    properties: JSON.parse(row.properties),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToRelation(row: any): Relation {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    type: row.type,
    source_entity_id: row.source_entity_id,
    target_entity_id: row.target_entity_id,
    weight: row.weight,
    properties: JSON.parse(row.properties),
    created_at: row.created_at,
  };
}

export function createEntity(
  tenantId: string,
  datasetId: string,
  type: string,
  name: string,
  properties: Record<string, unknown> = {}
): Entity {
  const db = getDb();
  const id = `ent_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  db.query(
    `INSERT INTO entities (id, tenant_id, dataset_id, type, name, properties) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, tenantId, datasetId, type, name, JSON.stringify(properties));

  return getEntity(id)!;
}

export function getEntity(id: string): Entity | null {
  const db = getDb();
  const row = db.query("SELECT * FROM entities WHERE id = ?").get(id) as any;
  return row ? rowToEntity(row) : null;
}

export function listEntities(datasetId: string, type?: string, limit = 100, offset = 0): Entity[] {
  const db = getDb();
  if (type) {
    const rows = db.query("SELECT * FROM entities WHERE dataset_id = ? AND type = ? ORDER BY name LIMIT ? OFFSET ?")
      .all(datasetId, type, limit, offset) as any[];
    return rows.map(rowToEntity);
  }
  const rows = db.query("SELECT * FROM entities WHERE dataset_id = ? ORDER BY name LIMIT ? OFFSET ?")
    .all(datasetId, limit, offset) as any[];
  return rows.map(rowToEntity);
}

export function findEntityByName(tenantId: string, name: string, type?: string): Entity | null {
  const db = getDb();
  if (type) {
    const row = db.query("SELECT * FROM entities WHERE tenant_id = ? AND name = ? AND type = ?")
      .get(tenantId, name, type) as any;
    return row ? rowToEntity(row) : null;
  }
  const row = db.query("SELECT * FROM entities WHERE tenant_id = ? AND name = ?")
    .get(tenantId, name) as any;
  return row ? rowToEntity(row) : null;
}

export function createRelation(
  tenantId: string,
  type: string,
  sourceEntityId: string,
  targetEntityId: string,
  weight = 1.0,
  properties: Record<string, unknown> = {}
): Relation {
  const db = getDb();
  const id = `rel_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  db.query(
    `INSERT INTO relations (id, tenant_id, type, source_entity_id, target_entity_id, weight, properties) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, tenantId, type, sourceEntityId, targetEntityId, weight, JSON.stringify(properties));

  return getRelation(id)!;
}

export function getRelation(id: string): Relation | null {
  const db = getDb();
  const row = db.query("SELECT * FROM relations WHERE id = ?").get(id) as any;
  return row ? rowToRelation(row) : null;
}

export function listRelations(datasetId: string, limit = 100, offset = 0): Relation[] {
  const db = getDb();
  const rows = db.query(
    `SELECT r.* FROM relations r
     JOIN entities e ON r.source_entity_id = e.id
     WHERE e.dataset_id = ?
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
  ).all(datasetId, limit, offset) as any[];
  return rows.map(rowToRelation);
}

export async function deleteEntity(id: string): Promise<boolean> {
  const entity = getEntity(id);
  if (entity) {
    try {
      await deleteEntityFromNeo4j(id);
    } catch {
      // Neo4j may be unavailable; continue with SQLite only
    }
  }
  const db = getDb();
  db.query("DELETE FROM relations WHERE source_entity_id = ? OR target_entity_id = ?").run(id, id);
  const result = db.query("DELETE FROM entities WHERE id = ?").run(id);
  return result.changes > 0;
}

export async function deleteRelation(id: string): Promise<boolean> {
  const relation = getRelation(id);
  if (relation) {
    try {
      await deleteRelationFromNeo4j(id);
    } catch {
      // Neo4j may be unavailable; continue with SQLite only
    }
  }
  const db = getDb();
  const result = db.query("DELETE FROM relations WHERE id = ?").run(id);
  return result.changes > 0;
}

export function updateEntity(id: string, updates: Partial<Entity>): Entity | null {
  const existing = getEntity(id);
  if (!existing) return null;
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.type !== undefined) { fields.push("type = ?"); values.push(updates.type); }
  if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
  if (updates.properties !== undefined) { fields.push("properties = ?"); values.push(JSON.stringify(updates.properties)); }
  if (fields.length === 0) return existing;
  values.push(id);
  db.query(`UPDATE entities SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  return getEntity(id)!;
}

export function updateRelation(id: string, updates: Partial<Relation>): Relation | null {
  const existing = getRelation(id);
  if (!existing) return null;
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.type !== undefined) { fields.push("type = ?"); values.push(updates.type); }
  if (updates.weight !== undefined) { fields.push("weight = ?"); values.push(updates.weight); }
  if (updates.properties !== undefined) { fields.push("properties = ?"); values.push(JSON.stringify(updates.properties)); }
  if (fields.length === 0) return existing;
  values.push(id);
  db.query(`UPDATE relations SET ${fields.join(", ")}, created_at = datetime('now') WHERE id = ?`).run(...values);
  return getRelation(id)!;
}

export async function deleteEntitiesByDataset(datasetId: string): Promise<number> {
  const db = getDb();
  const entityIds = db.query("SELECT id FROM entities WHERE dataset_id = ?").all(datasetId) as any[];
  if (entityIds.length > 0) {
    // Delete from Neo4j first
    for (const entity of entityIds) {
      try {
        await deleteEntityFromNeo4j(entity.id);
      } catch {
        // Neo4j may be unavailable; continue with SQLite only
      }
    }
    const placeholders = entityIds.map(() => "?").join(",");
    db.query(`DELETE FROM relations WHERE source_entity_id IN (${placeholders}) OR target_entity_id IN (${placeholders})`)
      .run(...entityIds.map((r: any) => r.id), ...entityIds.map((r: any) => r.id));
  }
  const result = db.query("DELETE FROM entities WHERE dataset_id = ?").run(datasetId);
  return result.changes;
}

// --- Neo4j Graph Operations ---

export async function upsertEntityInNeo4j(entity: Entity, database?: string): Promise<void> {
  await runCypher(
    `MERGE (e:Entity {id: $id})
     SET e.tenant_id = $tenant_id,
         e.dataset_id = $dataset_id,
         e.type = $type,
         e.name = $name,
         e.properties = $properties,
         e.updated_at = datetime()`,
    {
      id: entity.id,
      tenant_id: entity.tenant_id,
      dataset_id: entity.dataset_id,
      type: entity.type,
      name: entity.name,
      properties: JSON.stringify(entity.properties),
    },
    database
  );

  // Also add a label for the entity type for easy querying
  await runCypher(
    `MATCH (e:Entity {id: $id})
     SET e:${entity.type}`,
    { id: entity.id },
    database
  );
}

export async function createRelationInNeo4j(relation: Relation, database?: string): Promise<void> {
  await runCypher(
    `MATCH (source:Entity {id: $source_id})
     MATCH (target:Entity {id: $target_id})
     MERGE (source)-[r:${relation.type}]->(target)
     SET r.id = $id,
         r.tenant_id = $tenant_id,
         r.weight = $weight,
         r.properties = $properties,
         r.created_at = datetime()`,
    {
      source_id: relation.source_entity_id,
      target_id: relation.target_entity_id,
      id: relation.id,
      tenant_id: relation.tenant_id,
      weight: relation.weight,
      properties: JSON.stringify(relation.properties),
    },
    database
  );
}

export async function deleteEntityFromNeo4j(entityId: string, database?: string): Promise<void> {
  await runCypher(
    `MATCH (e:Entity {id: $id}) DETACH DELETE e`,
    { id: entityId },
    database
  );
}

export async function deleteRelationFromNeo4j(relationId: string, database?: string): Promise<void> {
  await runCypher(
    `MATCH ()-[r {id: $id}]->() DELETE r`,
    { id: relationId },
    database
  );
}

export async function findGraphPaths(
  tenantId: string,
  startEntityType: string,
  startEntityName: string,
  endEntityType: string,
  endEntityName: string,
  maxDepth = 5,
  database?: string
): Promise<any[]> {
  return runCypher(
    `MATCH path = (start:Entity {tenant_id: $tenant_id, type: $start_type, name: $start_name})-[*1..${maxDepth}]-(end:Entity {tenant_id: $tenant_id, type: $end_type, name: $end_name})
     RETURN path
     LIMIT 10`,
    {
      tenant_id: tenantId,
      start_type: startEntityType,
      start_name: startEntityName,
      end_type: endEntityType,
      end_name: endEntityName,
    },
    database
  );
}

export async function getEntityNeighbors(
  tenantId: string,
  entityId: string,
  depth = 1,
  database?: string
): Promise<any[]> {
  return runCypher(
    `MATCH (e:Entity {tenant_id: $tenant_id, id: $entity_id})-[*1..${depth}]-(neighbor:Entity)
     RETURN DISTINCT neighbor
     LIMIT 50`,
    { tenant_id: tenantId, entity_id: entityId },
    database
  );
}

// --- OpenAI Entity/Relation Extraction ---

function getClient(): OpenAI {
  const config = getConfig();
  return new OpenAI({
    apiKey: config.openai_api_key,
    ...(config.openai_base_url && { baseURL: config.openai_base_url }),
    timeout: 5000,
    maxRetries: 0,
  });
}

export async function extractGraphEntities(request: GraphExtractRequest): Promise<GraphExtractResult> {
  const config = getConfig();
  if (!config.openai_api_key) {
    throw new Error("OpenAI API key not configured — extraction unavailable");
  }
  const client = getClient();
  const model = resolveChatModel(request.model);

  const prompt = `You are a knowledge graph extraction assistant. Given structured data, extract entities and relations.

Entity types to look for: ${request.entity_types.join(", ")}
Relation types to look for: ${request.relation_types.join(", ")}

Data:
${JSON.stringify(request.data, null, 2)}

Return a JSON object with:
- "entities": array of objects, each with:
  - "name": entity name (unique identifier string)
  - "type": one of [${request.entity_types.join(", ")}]
  - "properties": object with any additional properties
- "relations": array of objects, each with:
  - "source": name of the source entity (must match an entity name)
  - "target": name of the target entity (must match an entity name)
  - "type": one of [${request.relation_types.join(", ")}]
  - "weight": optional number 0-1 indicating relation strength (default 1.0)
  - "properties": optional object with additional properties

Only extract entities and relations that are clearly supported by the data. Do not fabricate.`;

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  return {
    entities: parsed.entities || [],
    relations: parsed.relations || [],
  };
}
