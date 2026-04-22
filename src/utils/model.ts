import { getConfig } from "./config.js";

// Known OpenAI model name prefixes — if base URL points elsewhere, these won't work
const OPENAI_CHAT_MODELS = ["gpt-", "o1-", "o3-", "chatgpt-"];
const OPENAI_EMBEDDING_MODELS = ["text-embedding-", "ada-"];

const PROVIDER_CHAT_MODELS: Record<string, string> = {
  "bigmodel.cn": "glm-4-plus",
  "dashscope.aliyuncs.com": "qwen-plus",
  "api.moonshot.cn": "moonshot-v1-8k",
};

const PROVIDER_EMBEDDING_MODELS: Record<string, string> = {
  "bigmodel.cn": "embedding-3",
  "dashscope.aliyuncs.com": "text-embedding-v3",
  "api.moonshot.cn": "moonshot-v1-embedding",
};

function isProviderUrl(providerHost: string): boolean {
  const config = getConfig();
  return !!config.openai_base_url && config.openai_base_url.includes(providerHost);
}

function isOpenAIModel(model: string, prefixes: string[]): boolean {
  return prefixes.some((p) => model.startsWith(p));
}

/** Resolve a requested chat model name to one that works with the configured provider. */
export function resolveChatModel(requested?: string): string {
  const config = getConfig();

  if (!config.openai_base_url) {
    return requested || "gpt-4o-mini";
  }

  for (const [host, defaultModel] of Object.entries(PROVIDER_CHAT_MODELS)) {
    if (config.openai_base_url.includes(host)) {
      if (!requested || isOpenAIModel(requested, OPENAI_CHAT_MODELS)) {
        return defaultModel;
      }
      return requested;
    }
  }

  return requested || "gpt-4o-mini";
}

/** Resolve a requested embedding model name to one that works with the configured provider. */
export function resolveEmbeddingModel(requested?: string): string {
  const config = getConfig();

  if (!config.openai_base_url) {
    return requested || "text-embedding-3-small";
  }

  for (const [host, defaultModel] of Object.entries(PROVIDER_EMBEDDING_MODELS)) {
    if (config.openai_base_url.includes(host)) {
      if (!requested || isOpenAIModel(requested, OPENAI_EMBEDDING_MODELS)) {
        return defaultModel;
      }
      return requested;
    }
  }

  return requested || "text-embedding-3-small";
}
