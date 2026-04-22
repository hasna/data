import OpenAI from "openai";
import { getConfig } from "../utils/config.js";
import { resolveChatModel } from "../utils/model.js";
import {
  StructureRequest,
  StructureResult,
  SanitizeRequest,
  SanitizeResult,
  DatasetSchema,
} from "../types.js";

function getClient(): OpenAI {
  const config = getConfig();
  return new OpenAI({
    apiKey: config.openai_api_key,
    ...(config.openai_base_url && { baseURL: config.openai_base_url }),
    timeout: 5000,
    maxRetries: 0,
  });
}

export async function structureData(request: StructureRequest): Promise<StructureResult> {
  const client = getClient();
  const model = resolveChatModel(request.model);

  const fieldDescriptions = request.dataset_schema.fields
    .map((f) => `- ${f.name} (${f.type}${f.required ? ", required" : ""}): ${f.description || ""}`)
    .join("\n");

  const prompt = `You are a data structuring assistant. Given raw data and a schema, extract structured fields.

Schema fields:
${fieldDescriptions}

Strict mode: ${request.dataset_schema.strict ? "yes (all required fields must be present)" : "no (best effort)"}

Raw data:
${JSON.stringify(request.raw_data, null, 2)}

Return a JSON object with:
- "structured": object with extracted field values
- "confidence": number 0-1 indicating overall extraction confidence
- "fields_extracted": array of field names successfully extracted
- "fields_missing": array of required field names that could not be extracted`;

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  return {
    structured: parsed.structured || {},
    confidence: parsed.confidence ?? 0,
    fields_extracted: parsed.fields_extracted || [],
    fields_missing: parsed.fields_missing || [],
  };
}

export async function sanitizeData(request: SanitizeRequest): Promise<SanitizeResult> {
  const client = getClient();
  const model = resolveChatModel(request.model);

  const fieldDescriptions = request.dataset_schema.fields
    .map((f) => `- ${f.name} (${f.type})`)
    .join("\n");

  const prompt = `You are a data sanitization assistant. Given structured data, clean and validate it.

Schema fields:
${fieldDescriptions}

Tasks:
1. ${request.remove_pii ? "Remove or mask personally identifiable information (PII)" : "Leave PII as-is"}
2. Normalize values (trim whitespace, fix casing)
3. Validate types match schema
4. Flag duplicates if obvious

Input data:
${JSON.stringify(request.data, null, 2)}

Return a JSON object with:
- "sanitized": the cleaned data object
- "pii_removed": array of field names where PII was found and ${request.remove_pii ? "removed/masked" : "flagged"}
- "duplicates_found": number of suspected duplicates (0 if none)
- "validation_errors": array of validation error strings (empty if all valid)`;

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  return {
    sanitized: parsed.sanitized || request.data,
    pii_removed: parsed.pii_removed || [],
    duplicates_found: parsed.duplicates_found ?? 0,
    validation_errors: parsed.validation_errors || [],
  };
}
