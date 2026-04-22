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
import { IngestRequest, IngestResult } from "../types.js";

export async function ingestData(request: IngestRequest): Promise<IngestResult> {
  const config = getConfig();
  const dataset = getDataset(request.dataset_id);

  if (!dataset) {
    return { record_id: "", status: "error", message: `Dataset ${request.dataset_id} not found` };
  }

  // Create record in pending state
  const record = createRecord(request.dataset_id, request.tenant_id, {}, request.data);

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
  // Re-process a pending record using the full pipeline
  const { getRecord } = await import("./record.js");
  const record = getRecord(recordId);
  if (!record) {
    return { record_id: recordId, status: "error", message: "Record not found" };
  }

  const dataset = getDataset(record.dataset_id);
  if (!dataset) {
    return { record_id: recordId, status: "error", message: "Dataset not found" };
  }

  return ingestData({
    tenant_id: record.tenant_id,
    dataset_id: record.dataset_id,
    source: "api",
    data: record.raw_data || record.data,
    auto_process: true,
  });
}
