import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { getDataDir } from "../src/utils/config.js";
import { vectorizeTexts } from "../src/services/vectorize.js";
import * as vectorizeMod from "../src/services/vectorize.js";

describe("getDataDir", () => {
  test("returns the .hasna/data directory path", () => {
    const dir = getDataDir();
    expect(dir).toContain(".hasna");
    expect(dir).toContain("data");
  });
});

describe("vectorizeTexts API key guard", () => {
  const savedKey = process.env.OPENAI_API_KEY;

  afterAll(() => {
    if (savedKey) {
      process.env.OPENAI_API_KEY = savedKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test("throws when OpenAI API key is not configured", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(vectorizeTexts({ texts: ["hello"] })).rejects.toThrow(
      "OpenAI API key not configured"
    );
  });
});
