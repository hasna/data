import { getDataset, incrementRecordCount } from "./dataset.js";
import { createRecord, getRecord, updateRecordStatus, updateRecordData, updateRecordVector } from "./record.js";
import { structureData, sanitizeData } from "./structure.js";
import { vectorizeSingle, textToSearchable } from "./vectorize.js";
import {
  createEntity,
  createRelation,
  findEntityByName,
  upsertEntityInNeo4j,
  createRelationInNeo4j,
  extractGraphEntities,
} from "./graph.js";
import { getConfig } from "../utils/config.js";
import { IngestRequest, IngestResult, BatchIngestRequest, BatchIngestResult } from "../types.js";

export async function ingestData(request: IngestRequest): Promise<IngestResult> {
  const config = getConfig();
  const dataset = getDataset(request.dataset_id);

  if (!dataset) {
    return { record_id: "", status: "error", message: `Dataset ${request.dataset_id} not found` };
  }

  // Create record in pending state
  const recordData = typeof request.data === "object" && request.data !== null
    ? request.data as Record<string, unknown>
    : { raw: request.data };
  const record = createRecord(request.dataset_id, request.tenant_id, recordData, request.data);

  if (!request.auto_process) {
    incrementRecordCount(request.dataset_id);
    return { record_id: record.id, status: "pending", message: "Record created, awaiting processing" };
  }

  // Run the full pipeline
  try {
    // Step 1: Structure
    updateRecordStatus(record.id, "structured");
    if (dataset.schema.fields.length > 0) {
      const structureResult = await structureData({
        raw_data: request.data,
        dataset_schema: dataset.schema,
        model: undefined,
      });
      updateRecordData(record.id, structureResult.structured);
    } else {
      updateRecordData(record.id, typeof request.data === "object" ? request.data as Record<string, unknown> : { raw: request.data });
    }

    // Step 2: Sanitize
    updateRecordStatus(record.id, "sanitized");
    const sanitizeResult = await sanitizeData({
      data: typeof request.data === "object" ? request.data as Record<string, unknown> : { raw: request.data },
      dataset_schema: dataset.schema,
      remove_pii: true,
    });
    updateRecordData(record.id, sanitizeResult.sanitized);

    // Step 3: Vectorize (non-fatal — skip on failure)
    if (dataset.vector_config.enabled && dataset.vector_config.auto_embed) {
      try {
        const text = textToSearchable(sanitizeResult.sanitized);
        const embedding = await vectorizeSingle(text, dataset.vector_config.model);
        updateRecordVector(record.id, embedding);
      } catch (err: any) {
        // Vectorization failed — record still usable without embeddings
      }
    }

    // Step 4: Graph extract (non-fatal — skip on failure)
    if (dataset.graph_config.enabled && dataset.graph_config.auto_extract) {
      try {
        const graphResult = await extractGraphEntities({
          data: sanitizeResult.sanitized,
          entity_types: dataset.graph_config.entity_types,
          relation_types: dataset.graph_config.relation_types,
        });

        const tenant = dataset.tenant_id;
        const entityNameMap = new Map<string, string>(); // name -> entity id

        for (const ent of graphResult.entities) {
          let existing = findEntityByName(tenant, ent.name, ent.type);
          if (!existing) {
            existing = createEntity(tenant, request.dataset_id, ent.type, ent.name, ent.properties);
          }
          entityNameMap.set(ent.name, existing.id);

          try {
            await upsertEntityInNeo4j(existing);
          } catch {
            // Neo4j may be unavailable; continue with SQLite only
          }
        }

        for (const rel of graphResult.relations) {
          const sourceId = entityNameMap.get(rel.source);
          const targetId = entityNameMap.get(rel.target);
          if (sourceId && targetId) {
            const relation = createRelation(tenant, rel.type, sourceId, targetId, rel.weight ?? 1.0, rel.properties);
            try {
              await createRelationInNeo4j(relation);
            } catch {
              // Neo4j may be unavailable; continue with SQLite only
            }
          }
        }
      } catch (err: any) {
        // Graph extraction failed — record still usable without graph
      }
    }

    // Step 5: Complete
    updateRecordStatus(record.id, "complete");
    incrementRecordCount(request.dataset_id);

    return { record_id: record.id, status: "complete", message: "Record indexed successfully" };
  } catch (err: any) {
    updateRecordStatus(record.id, "error", err.message);
    incrementRecordCount(request.dataset_id);
    return { record_id: record.id, status: "error", message: `Processing failed: ${err.message}` };
  }
}

export async function processPendingRecord(recordId: string): Promise<IngestResult> {
  const record = getRecord(recordId);
  if (!record) {
    return { record_id: recordId, status: "error", message: "Record not found" };
  }

  const dataset = getDataset(record.dataset_id);
  if (!dataset) {
    return { record_id: recordId, status: "error", message: "Dataset not found" };
  }

  try {
    // Step 1: Structure
    updateRecordStatus(record.id, "structured");
    if (dataset.schema.fields.length > 0) {
      const structureResult = await structureData({
        raw_data: record.raw_data ?? record.data,
        dataset_schema: dataset.schema,
        model: undefined,
      });
      updateRecordData(record.id, structureResult.structured);
    } else {
      updateRecordData(record.id, typeof record.raw_data === "object" ? record.raw_data as Record<string, unknown> : record.data);
    }

    // Step 2: Sanitize
    updateRecordStatus(record.id, "sanitized");
    const sanitizeResult = await sanitizeData({
      data: typeof record.raw_data === "object" ? record.raw_data as Record<string, unknown> : record.data,
      dataset_schema: dataset.schema,
      remove_pii: true,
    });
    updateRecordData(record.id, sanitizeResult.sanitized);

    // Step 3: Vectorize (non-fatal — skip on failure)
    if (dataset.vector_config.enabled && dataset.vector_config.auto_embed) {
      try {
        const text = textToSearchable(sanitizeResult.sanitized);
        const embedding = await vectorizeSingle(text, dataset.vector_config.model);
        updateRecordVector(record.id, embedding);
      } catch {
        // Vectorization failed — record still usable without embeddings
      }
    }

    // Step 4: Graph extract (non-fatal — skip on failure)
    if (dataset.graph_config.enabled && dataset.graph_config.auto_extract) {
      try {
        const graphResult = await extractGraphEntities({
          data: sanitizeResult.sanitized,
          entity_types: dataset.graph_config.entity_types,
          relation_types: dataset.graph_config.relation_types,
        });

        const tenant = dataset.tenant_id;
        const entityNameMap = new Map<string, string>();

        for (const ent of graphResult.entities) {
          let existing = findEntityByName(tenant, ent.name, ent.type);
          if (!existing) {
            existing = createEntity(tenant, record.dataset_id, ent.type, ent.name, ent.properties);
          }
          entityNameMap.set(ent.name, existing.id);

          try {
            await upsertEntityInNeo4j(existing);
          } catch {
            // Neo4j may be unavailable
          }
        }

        for (const rel of graphResult.relations) {
          const sourceId = entityNameMap.get(rel.source);
          const targetId = entityNameMap.get(rel.target);
          if (sourceId && targetId) {
            const relation = createRelation(tenant, rel.type, sourceId, targetId, rel.weight ?? 1.0, rel.properties);
            try {
              await createRelationInNeo4j(relation);
            } catch {
              // Neo4j may be unavailable
            }
          }
        }
      } catch {
        // Graph extraction failed — record still usable without graph
      }
    }

    // Step 5: Complete
    updateRecordStatus(record.id, "complete");
    incrementRecordCount(record.dataset_id);

    return { record_id: record.id, status: "complete", message: "Record processed successfully" };
  } catch (err: any) {
    updateRecordStatus(record.id, "error", err.message);
    incrementRecordCount(record.dataset_id);
    return { record_id: record.id, status: "error", message: `Processing failed: ${err.message}` };
  }
}

export async function batchIngestData(request: BatchIngestRequest): Promise<BatchIngestResult> {
  const concurrency = request.concurrency ?? 5;
  const results: IngestResult[] = [];

  // Process records in batches
  for (let i = 0; i < request.records.length; i += concurrency) {
    const batch = request.records.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((data) =>
        ingestData({
          tenant_id: request.tenant_id,
          dataset_id: request.dataset_id,
          source: request.source,
          data,
          auto_process: request.auto_process ?? true,
        })
      )
    );
    results.push(...batchResults);
  }

  return { total: results.length, results };
}
