#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import React from "react";
import { render, Box, Text } from "ink";
import { getConfig } from "../utils/config.js";
import { initDb, closeDb } from "../db/sqlite.js";
import { closeNeo4j, checkNeo4jHealth } from "../db/neo4j.js";
import {
  createTenant,
  getTenant,
  getTenantBySlug,
  listTenants,
  updateTenant,
  deleteTenant,
  createDataset,
  getDataset,
  listDatasets,
  updateDataset,
  deleteDataset,
  ingestData,
  search,
  createRecord,
  getRecord,
  listRecords,
  updateRecordStatus,
  updateRecordData,
  deleteRecord,
  deleteRecordsByDataset,
  countRecordsByStatus,
  processPendingRecord,
  listEntities,
  listRelations,
  createEntity,
  createRelation,
  updateEntity,
  updateRelation,
  getEntity,
  getRelation,
  deleteEntity,
  deleteRelation,
  deleteEntitiesByDataset,
  findEntityByName,
  findGraphPaths,
  getEntityNeighbors,
  extractGraphEntities,
  structureData,
  sanitizeData,
  vectorizeTexts,
  cosineSimilarity,
  textToSearchable,
} from "../services/index.js";

const program = new Command();

program
  .name("data")
  .description("Structured data indexing with local knowledge graphs")
  .version("0.1.0")
  .hook("preAction", () => { initDb(); })
  .hook("postAction", () => { closeDb(); closeNeo4j(); });

// --- Tenant commands ---

const tenant = program.command("tenant").description("Manage tenants");

tenant
  .command("create")
  .description("Create a new tenant")
  .requiredOption("-n, --name <name>", "Tenant name")
  .requiredOption("-s, --slug <slug>", "Tenant slug")
  .option("-t, --type <type>", "Tenant type", "personal")
  .action(async (opts) => {
    const t = createTenant({ name: opts.name, slug: opts.slug, type: opts.type });
    console.log(JSON.stringify(t, null, 2));
  });

tenant
  .command("get")
  .description("Get tenant by ID")
  .argument("<id>", "Tenant ID")
  .action((id) => {
    const t = getTenant(id);
    if (!t) { console.error(chalk.red("Tenant not found")); process.exit(1); }
    console.log(JSON.stringify(t, null, 2));
  });

tenant
  .command("list")
  .description("List all tenants")
  .action(() => {
    const tenants = listTenants();
    console.log(JSON.stringify(tenants, null, 2));
  });

tenant
  .command("get-by-slug")
  .description("Get a tenant by slug")
  .argument("<slug>", "Tenant slug")
  .action((slug) => {
    const t = getTenantBySlug(slug);
    if (!t) { console.error(chalk.red("Tenant not found")); process.exit(1); }
    console.log(JSON.stringify(t, null, 2));
  });

tenant
  .command("delete")
  .description("Delete a tenant")
  .argument("<id>", "Tenant ID")
  .action((id) => {
    const ok = deleteTenant(id);
    console.log(ok ? chalk.green("Deleted") : chalk.red("Not found"));
  });

tenant
  .command("update")
  .description("Update a tenant")
  .argument("<id>", "Tenant ID")
  .option("-n, --name <name>", "Tenant name")
  .option("-t, --type <type>", "Tenant type")
  .option("--settings <json>", "Tenant settings (JSON)")
  .action((id, opts) => {
    const input: Record<string, unknown> = {};
    if (opts.name) input.name = opts.name;
    if (opts.type) input.type = opts.type;
    if (opts.settings) input.settings = JSON.parse(opts.settings);
    const t = updateTenant(id, input as any);
    if (!t) { console.error(chalk.red("Tenant not found")); process.exit(1); }
    console.log(JSON.stringify(t, null, 2));
  });

// --- Dataset commands ---

const dataset = program.command("dataset").description("Manage datasets");

dataset
  .command("create")
  .description("Create a new dataset")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("-n, --name <name>", "Dataset name")
  .option("-d, --description <desc>", "Description")
  .option("--no-vectors", "Disable vector embeddings")
  .option("--no-graph", "Disable graph extraction")
  .action(async (opts) => {
    const ds = createDataset({
      tenant_id: opts.tenant,
      name: opts.name,
      description: opts.description,
      vector_config: { enabled: opts.vectors, auto_embed: opts.vectors },
      graph_config: { enabled: opts.graph, auto_extract: opts.graph },
    });
    console.log(JSON.stringify(ds, null, 2));
  });

dataset
  .command("get")
  .description("Get dataset by ID")
  .argument("<id>", "Dataset ID")
  .action((id) => {
    const ds = getDataset(id);
    if (!ds) { console.error(chalk.red("Dataset not found")); process.exit(1); }
    console.log(JSON.stringify(ds, null, 2));
  });

dataset
  .command("list")
  .description("List datasets for a tenant")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .action((opts) => {
    const datasets = listDatasets(opts.tenant);
    console.log(JSON.stringify(datasets, null, 2));
  });

dataset
  .command("delete")
  .description("Delete a dataset")
  .argument("<id>", "Dataset ID")
  .action((id) => {
    const ok = deleteDataset(id);
    console.log(ok ? chalk.green("Deleted") : chalk.red("Not found"));
  });

dataset
  .command("update")
  .description("Update a dataset")
  .argument("<id>", "Dataset ID")
  .option("-n, --name <name>", "Dataset name")
  .option("-d, --description <desc>", "Description")
  .option("--schema <json>", "Dataset schema (JSON)")
  .action((id, opts) => {
    const input: Record<string, unknown> = {};
    if (opts.name) input.name = opts.name;
    if (opts.description !== undefined) input.description = opts.description;
    if (opts.schema) input.schema = JSON.parse(opts.schema);
    const ds = updateDataset(id, input as any);
    if (!ds) { console.error(chalk.red("Dataset not found")); process.exit(1); }
    console.log(JSON.stringify(ds, null, 2));
  });

// --- Ingest command ---

program
  .command("ingest")
  .description("Ingest data into a dataset")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .option("-f, --file <path>", "Input file (JSON)")
  .option("--data <json>", "Inline JSON data")
  .option("--no-process", "Do not auto-process")
  .action(async (opts) => {
    let data: unknown;
    if (opts.file) {
      const fs = await import("node:fs/promises");
      data = JSON.parse(await fs.readFile(opts.file, "utf-8"));
    } else if (opts.data) {
      data = JSON.parse(opts.data);
    } else {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      data = JSON.parse(Buffer.concat(chunks).toString());
    }

    const result = await ingestData({
      tenant_id: opts.tenant,
      dataset_id: opts.dataset,
      source: "api",
      data,
      auto_process: opts.process,
    });
    console.log(JSON.stringify(result, null, 2));
  });

// --- Search command ---

program
  .command("search")
  .description("Search indexed data")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("-q, --query <query>", "Search query")
  .option("-d, --datasets <ids...>", "Dataset IDs to search")
  .option("-s, --search-type <type>", "Search type: vector, graph, hybrid", "vector")
  .option("-l, --limit <n>", "Max results", "10")
  .action(async (opts) => {
    const result = await search({
      tenant_id: opts.tenant,
      query: opts.query,
      datasets: opts.datasets,
      search_type: opts.searchType,
      limit: parseInt(opts.limit, 10),
    });
    console.log(JSON.stringify(result, null, 2));
  });

// --- Record commands ---

const record = program.command("record").description("Manage records");

record
  .command("create")
  .description("Create a new record")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("--data <json>", "Record data (JSON)")
  .option("--raw-data <json>", "Original raw data (JSON)")
  .action((opts) => {
    const data = JSON.parse(opts.data);
    const rawData = opts.rawData ? JSON.parse(opts.rawData) : undefined;
    const r = createRecord(opts.dataset, opts.tenant, data, rawData);
    console.log(JSON.stringify(r, null, 2));
  });

record
  .command("get")
  .description("Get a record by ID")
  .argument("<id>", "Record ID")
  .action((id) => {
    const r = getRecord(id);
    if (!r) { console.error(chalk.red("Record not found")); process.exit(1); }
    console.log(JSON.stringify(r, null, 2));
  });

record
  .command("list")
  .description("List records in a dataset")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .option("--status <status>", "Filter by status")
  .option("-l, --limit <n>", "Max results", "20")
  .option("--offset <n>", "Offset", "0")
  .action((opts) => {
    const records = listRecords(opts.dataset, opts.status, parseInt(opts.limit, 10), parseInt(opts.offset, 10));
    console.log(JSON.stringify(records, null, 2));
  });

record
  .command("process")
  .description("Process a pending record")
  .argument("<id>", "Record ID")
  .action(async (id) => {
    const result = await processPendingRecord(id);
    console.log(JSON.stringify(result, null, 2));
  });

record
  .command("update-status")
  .description("Update a record's status")
  .argument("<id>", "Record ID")
  .requiredOption("-s, --status <status>", "New status")
  .option("-e, --error <message>", "Error message")
  .action((id, opts) => {
    const r = updateRecordStatus(id, opts.status, opts.error);
    if (!r) { console.error(chalk.red("Record not found")); process.exit(1); }
    console.log(JSON.stringify(r, null, 2));
  });

record
  .command("update-data")
  .description("Update a record's data")
  .argument("<id>", "Record ID")
  .requiredOption("--data <json>", "New data (JSON)")
  .action((id, opts) => {
    const data = JSON.parse(opts.data);
    const r = updateRecordData(id, data);
    if (!r) { console.error(chalk.red("Record not found")); process.exit(1); }
    console.log(JSON.stringify(r, null, 2));
  });

record
  .command("delete")
  .description("Delete a record")
  .argument("<id>", "Record ID")
  .action((id) => {
    const ok = deleteRecord(id);
    console.log(ok ? chalk.green("Deleted") : chalk.red("Not found"));
  });

record
  .command("delete-by-dataset")
  .description("Delete all records in a dataset")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .action((opts) => {
    const count = deleteRecordsByDataset(opts.dataset);
    console.log(chalk.green(`Deleted ${count} records`));
  });

record
  .command("count")
  .description("Count records by status in a dataset")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .action((opts) => {
    const counts = countRecordsByStatus(opts.dataset);
    console.log(JSON.stringify(counts, null, 2));
  });

// --- Graph commands ---

const graph = program.command("graph").description("Explore knowledge graph");

graph
  .command("entities")
  .description("List entities in a dataset")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .option("--type <type>", "Filter by entity type")
  .option("-l, --limit <n>", "Max results", "100")
  .option("-o, --offset <n>", "Result offset", "0")
  .action((opts) => {
    const entities = listEntities(opts.dataset, opts.type, parseInt(opts.limit, 10), parseInt(opts.offset, 10));
    console.log(JSON.stringify(entities, null, 2));
  });

graph
  .command("relations")
  .description("List relations in a dataset")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .option("-l, --limit <n>", "Max results", "100")
  .option("-o, --offset <n>", "Result offset", "0")
  .action((opts) => {
    const relations = listRelations(opts.dataset, parseInt(opts.limit, 10), parseInt(opts.offset, 10));
    console.log(JSON.stringify(relations, null, 2));
  });

graph
  .command("create-entity")
  .description("Create a new entity")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("--type <type>", "Entity type")
  .requiredOption("--name <name>", "Entity name")
  .option("--properties <json>", "Entity properties (JSON)")
  .action((opts) => {
    const props = opts.properties ? JSON.parse(opts.properties) : {};
    const entity = createEntity(opts.tenant, opts.dataset, opts.type, opts.name, props);
    console.log(JSON.stringify(entity, null, 2));
  });

graph
  .command("get-entity")
  .description("Get an entity by ID")
  .argument("<id>", "Entity ID")
  .action((id) => {
    const entity = getEntity(id);
    if (!entity) { console.error(chalk.red("Entity not found")); process.exit(1); }
    console.log(JSON.stringify(entity, null, 2));
  });

graph
  .command("find-entity")
  .description("Find an entity by name")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .argument("<name>", "Entity name")
  .option("--type <type>", "Entity type filter")
  .action((name, opts) => {
    const entity = findEntityByName(opts.tenant, name, opts.type);
    if (!entity) { console.error(chalk.red("Entity not found")); process.exit(1); }
    console.log(JSON.stringify(entity, null, 2));
  });

graph
  .command("delete-entity")
  .description("Delete an entity")
  .argument("<id>", "Entity ID")
  .action(async (id) => {
    const ok = await deleteEntity(id);
    console.log(ok ? chalk.green("Deleted") : chalk.red("Not found"));
  });

graph
  .command("create-relation")
  .description("Create a new relation")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("--type <type>", "Relation type")
  .requiredOption("--source <sourceEntityId>", "Source entity ID")
  .requiredOption("--target <targetEntityId>", "Target entity ID")
  .option("--weight <n>", "Relation weight", "1.0")
  .option("--properties <json>", "Relation properties (JSON)")
  .action((opts) => {
    const props = opts.properties ? JSON.parse(opts.properties) : {};
    const relation = createRelation(opts.tenant, opts.type, opts.source, opts.target, parseFloat(opts.weight), props);
    console.log(JSON.stringify(relation, null, 2));
  });

graph
  .command("get-relation")
  .description("Get a relation by ID")
  .argument("<id>", "Relation ID")
  .action((id) => {
    const relation = getRelation(id);
    if (!relation) { console.error(chalk.red("Relation not found")); process.exit(1); }
    console.log(JSON.stringify(relation, null, 2));
  });

graph
  .command("delete-relation")
  .description("Delete a relation")
  .argument("<id>", "Relation ID")
  .action(async (id) => {
    const ok = await deleteRelation(id);
    console.log(ok ? chalk.green("Deleted") : chalk.red("Not found"));
  });

graph
  .command("delete-entities-by-dataset")
  .description("Delete all entities in a dataset")
  .requiredOption("-d, --dataset <datasetId>", "Dataset ID")
  .action(async (opts) => {
    const count = await deleteEntitiesByDataset(opts.dataset);
    console.log(chalk.green(`Deleted ${count} entities`));
  });

graph
  .command("paths")
  .description("Find paths between two entities")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("--start-type <type>", "Start entity type")
  .requiredOption("--start-name <name>", "Start entity name")
  .requiredOption("--end-type <type>", "End entity type")
  .requiredOption("--end-name <name>", "End entity name")
  .option("--max-depth <n>", "Maximum path depth", "5")
  .action(async (opts) => {
    const paths = await findGraphPaths(opts.tenant, opts.startType, opts.startName, opts.endType, opts.endName, parseInt(opts.maxDepth, 10));
    console.log(JSON.stringify(paths, null, 2));
  });

graph
  .command("neighbors")
  .description("Get entity neighbors")
  .requiredOption("-t, --tenant <tenantId>", "Tenant ID")
  .requiredOption("--entity-id <id>", "Entity ID")
  .option("--depth <n>", "Traversal depth", "1")
  .action(async (opts) => {
    const neighbors = await getEntityNeighbors(opts.tenant, opts.entityId, parseInt(opts.depth, 10));
    console.log(JSON.stringify(neighbors, null, 2));
  });

graph
  .command("update-entity")
  .description("Update an entity")
  .argument("<id>", "Entity ID")
  .option("--type <type>", "Entity type")
  .option("--name <name>", "Entity name")
  .option("--properties <json>", "Entity properties (JSON)")
  .action((id, opts) => {
    const updates: Record<string, unknown> = {};
    if (opts.type) updates.type = opts.type;
    if (opts.name) updates.name = opts.name;
    if (opts.properties !== undefined) updates.properties = JSON.parse(opts.properties);
    const entity = updateEntity(id, updates);
    if (!entity) { console.error(chalk.red("Entity not found")); process.exit(1); }
    console.log(JSON.stringify(entity, null, 2));
  });

graph
  .command("update-relation")
  .description("Update a relation")
  .argument("<id>", "Relation ID")
  .option("--type <type>", "Relation type")
  .option("--weight <n>", "Relation weight")
  .option("--properties <json>", "Relation properties (JSON)")
  .action((id, opts) => {
    const updates: Record<string, unknown> = {};
    if (opts.type) updates.type = opts.type;
    if (opts.weight !== undefined) updates.weight = parseFloat(opts.weight);
    if (opts.properties !== undefined) updates.properties = JSON.parse(opts.properties);
    const relation = updateRelation(id, updates);
    if (!relation) { console.error(chalk.red("Relation not found")); process.exit(1); }
    console.log(JSON.stringify(relation, null, 2));
  });

graph
  .command("extract")
  .description("Extract entities and relations from data using AI")
  .requiredOption("--data <json>", "Input data (JSON)")
  .requiredOption("--entity-types <types...>", "Entity types to extract")
  .requiredOption("--relation-types <types...>", "Relation types to extract")
  .option("--model <model>", "Model to use")
  .action(async (opts) => {
    const data = JSON.parse(opts.data);
    const result = await extractGraphEntities({
      data,
      entity_types: opts.entityTypes,
      relation_types: opts.relationTypes,
      model: opts.model,
    });
    console.log(JSON.stringify(result, null, 2));
  });

// --- Structure / Sanitize commands ---

program
  .command("structure")
  .description("Extract structured fields from raw data")
  .requiredOption("--schema <json>", "Dataset schema (JSON)")
  .option("--data <json>", "Raw data (JSON)")
  .option("-f, --file <path>", "Input file (JSON)")
  .option("--model <model>", "Model to use")
  .action(async (opts) => {
    let rawData: unknown;
    if (opts.file) {
      const fs = await import("node:fs/promises");
      rawData = JSON.parse(await fs.readFile(opts.file, "utf-8"));
    } else if (opts.data) {
      rawData = JSON.parse(opts.data);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      rawData = JSON.parse(Buffer.concat(chunks).toString());
    }

    const schema = JSON.parse(opts.schema) as import("../types.js").DatasetSchema;
    const result = await structureData({
      raw_data: rawData as Record<string, unknown>,
      dataset_schema: schema,
      model: opts.model,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("sanitize")
  .description("Clean and validate structured data")
  .requiredOption("--schema <json>", "Dataset schema (JSON)")
  .option("--data <json>", "Data to sanitize (JSON)")
  .option("-f, --file <path>", "Input file (JSON)")
  .option("--no-pii", "Do not remove PII")
  .option("--model <model>", "Model to use")
  .action(async (opts) => {
    let data: unknown;
    if (opts.file) {
      const fs = await import("node:fs/promises");
      data = JSON.parse(await fs.readFile(opts.file, "utf-8"));
    } else if (opts.data) {
      data = JSON.parse(opts.data);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      data = JSON.parse(Buffer.concat(chunks).toString());
    }

    const schema = JSON.parse(opts.schema) as import("../types.js").DatasetSchema;
    const result = await sanitizeData({
      data: data as Record<string, unknown>,
      dataset_schema: schema,
      remove_pii: opts.pii,
      model: opts.model,
    });
    console.log(JSON.stringify(result, null, 2));
  });

// --- Vectorize command ---

program
  .command("vectorize")
  .description("Convert text to vector embeddings")
  .option("--texts <json>", "Array of texts (JSON)")
  .option("-f, --file <path>", "Input file with text array (JSON)")
  .option("--model <model>", "Embedding model to use")
  .action(async (opts) => {
    let texts: string[];
    if (opts.texts) {
      texts = JSON.parse(opts.texts);
    } else if (opts.file) {
      const fs = await import("node:fs/promises");
      texts = JSON.parse(await fs.readFile(opts.file, "utf-8"));
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      texts = JSON.parse(Buffer.concat(chunks).toString());
    }

    const result = await vectorizeTexts({
      texts,
      model: opts.model,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("similarity")
  .description("Calculate cosine similarity between two vectors")
  .requiredOption("--a <json>", "First vector (JSON array)")
  .requiredOption("--b <json>", "Second vector (JSON array)")
  .action((opts) => {
    const a = JSON.parse(opts.a) as number[];
    const b = JSON.parse(opts.b) as number[];
    const sim = cosineSimilarity(a, b);
    console.log(JSON.stringify({ similarity: sim }, null, 2));
  });

program
  .command("to-searchable")
  .description("Convert an object to a searchable string")
  .option("--data <json>", "Object to convert (JSON)")
  .option("-f, --file <path>", "Input file (JSON)")
  .action(async (opts) => {
    let data: unknown;
    if (opts.data) {
      data = JSON.parse(opts.data);
    } else if (opts.file) {
      const fs = await import("node:fs/promises");
      data = JSON.parse(await fs.readFile(opts.file, "utf-8"));
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      data = JSON.parse(Buffer.concat(chunks).toString());
    }
    const text = textToSearchable(data as Record<string, unknown>);
    console.log(text);
  });

// --- Status command ---

program
  .command("status")
  .description("Show system status")
  .action(async () => {
    const config = getConfig();
    const neo4j = await checkNeo4jHealth();
    console.log(JSON.stringify({
      db_path: config.db_path,
      neo4j: neo4j.ok ? "connected" : "unavailable",
      openai_configured: !!config.openai_api_key,
      port: config.port,
    }, null, 2));
  });

program.parse();
