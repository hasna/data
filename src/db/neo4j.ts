import neo4j, { Driver, Session, ManagedTransaction } from "neo4j-driver";
import { getConfig } from "../utils/config.js";

let driverInstance: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (driverInstance) return driverInstance;

  const config = getConfig();
  driverInstance = neo4j.driver(
    config.neo4j_uri,
    neo4j.auth.basic(config.neo4j_user, config.neo4j_password),
    { maxConnectionPoolSize: 50 }
  );
  return driverInstance;
}

export async function closeNeo4j(): Promise<void> {
  if (driverInstance) {
    await driverInstance.close();
    driverInstance = null;
  }
}

export async function checkNeo4jHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const driver = getNeo4jDriver();
    const serverInfo = await driver.getServerInfo();
    return { ok: true, message: `Connected to Neo4j ${serverInfo.agent}` };
  } catch (err: any) {
    return { ok: false, message: `Neo4j unavailable: ${err.message}` };
  }
}

export async function runCypher<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
  database?: string
): Promise<T[]> {
  const driver = getNeo4jDriver();
  const session = database ? driver.session({ database }) : driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map((record) => {
      const obj: Record<string, unknown> = {};
      record.keys.forEach((key) => {
        obj[key as string] = record.get(key);
      });
      return obj as T;
    });
  } finally {
    await session.close();
  }
}

export async function runInTransaction<T>(
  fn: (tx: ManagedTransaction) => Promise<T>,
  database?: string
): Promise<T> {
  const driver = getNeo4jDriver();
  const session = database ? driver.session({ database }) : driver.session();
  try {
    return await session.executeWrite(fn);
  } finally {
    await session.close();
  }
}

// Initialize Neo4j constraints for a tenant database
export async function initTenantSchema(database?: string): Promise<void> {
  const driver = getNeo4jDriver();
  const session = database ? driver.session({ database }) : driver.session();
  try {
    await session.run(`
      CREATE CONSTRAINT entity_id IF NOT EXISTS
      FOR (e:Entity) REQUIRE e.id IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT entity_tenant IF NOT EXISTS
      FOR (e:Entity) REQUIRE e.tenant_id IS NOT NULL
    `);
    await session.run(`
      CREATE INDEX entity_type_idx IF NOT EXISTS
      FOR (e:Entity) ON (e.type)
    `);
    await session.run(`
      CREATE INDEX entity_name_idx IF NOT EXISTS
      FOR (e:Entity) ON (e.name)
    `);
  } finally {
    await session.close();
  }
}
