import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { resolveChatModel, resolveEmbeddingModel } from "../src/utils/model.js";

const ORIGINAL_BASE_URL = process.env.OPENAI_BASE_URL;

describe("resolveChatModel", () => {
  afterEach(() => {
    delete process.env.OPENAI_BASE_URL;
  });

  test("returns gpt-4o-mini when no base URL and no requested model", () => {
    delete process.env.OPENAI_BASE_URL;
    expect(resolveChatModel()).toBe("gpt-4o-mini");
  });

  test("returns requested model when no base URL", () => {
    delete process.env.OPENAI_BASE_URL;
    expect(resolveChatModel("my-custom-model")).toBe("my-custom-model");
  });

  test("substitutes OpenAI model with bigmodel.cn default", () => {
    process.env.OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    expect(resolveChatModel("gpt-4o")).toBe("glm-4-plus");
  });

  test("keeps non-OpenAI model when bigmodel.cn base URL", () => {
    process.env.OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    expect(resolveChatModel("glm-4-plus")).toBe("glm-4-plus");
  });

  test("substitutes OpenAI model with dashscope default", () => {
    process.env.OPENAI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    expect(resolveChatModel("gpt-4o-mini")).toBe("qwen-plus");
  });

  test("substitutes OpenAI model with moonshot default", () => {
    process.env.OPENAI_BASE_URL = "https://api.moonshot.cn/v1";
    expect(resolveChatModel("o1-preview")).toBe("moonshot-v1-8k");
  });

  test("returns provider default when no model requested", () => {
    process.env.OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    expect(resolveChatModel()).toBe("glm-4-plus");
  });

  test("returns requested non-OpenAI model with dashscope base URL", () => {
    process.env.OPENAI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    expect(resolveChatModel("qwen-turbo")).toBe("qwen-turbo");
  });
});

describe("resolveEmbeddingModel", () => {
  afterEach(() => {
    delete process.env.OPENAI_BASE_URL;
  });

  test("returns text-embedding-3-small when no base URL and no requested model", () => {
    delete process.env.OPENAI_BASE_URL;
    expect(resolveEmbeddingModel()).toBe("text-embedding-3-small");
  });

  test("returns requested model when no base URL", () => {
    delete process.env.OPENAI_BASE_URL;
    expect(resolveEmbeddingModel("text-embedding-3-large")).toBe("text-embedding-3-large");
  });

  test("substitutes OpenAI embedding model with bigmodel.cn default", () => {
    process.env.OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    expect(resolveEmbeddingModel("text-embedding-3-small")).toBe("embedding-3");
  });

  test("substitutes OpenAI embedding model with dashscope default", () => {
    process.env.OPENAI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    expect(resolveEmbeddingModel("ada-002")).toBe("text-embedding-v3");
  });

  test("keeps non-OpenAI embedding model with bigmodel.cn base URL", () => {
    process.env.OPENAI_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    expect(resolveEmbeddingModel("embedding-3")).toBe("embedding-3");
  });

  test("returns provider default when no model requested", () => {
    process.env.OPENAI_BASE_URL = "https://api.moonshot.cn/v1";
    expect(resolveEmbeddingModel()).toBe("moonshot-v1-embedding");
  });
});
