import OpenAI from "openai";
import { getConfig } from "../utils/config.js";
import { resolveEmbeddingModel } from "../utils/model.js";
import { VectorizeRequest, VectorizeResult } from "../types.js";

function getClient(): OpenAI {
  const config = getConfig();
  return new OpenAI({
    apiKey: config.openai_api_key,
    ...(config.openai_base_url && { baseURL: config.openai_base_url }),
    timeout: 5000,
    maxRetries: 0,
  });
}

export async function vectorizeTexts(request: VectorizeRequest): Promise<VectorizeResult> {
  const config = getConfig();
  if (!config.openai_api_key) {
    throw new Error("OpenAI API key not configured — vectorization unavailable");
  }
  const client = getClient();
  const model = resolveEmbeddingModel(request.model);

  const response = await client.embeddings.create({
    model,
    input: request.texts,
  });

  const embeddings = response.data.map((item) => item.embedding);
  const totalTokens = response.usage?.total_tokens ?? 0;

  return {
    embeddings,
    model,
    dimensions: embeddings[0]?.length ?? 0,
    total_tokens: totalTokens,
  };
}

export async function vectorizeSingle(text: string, model?: string): Promise<number[]> {
  const result = await vectorizeTexts({ texts: [text], model });
  return result.embeddings[0];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function textToSearchable(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.join("\n");
}
