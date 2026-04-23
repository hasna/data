import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock OpenAI module — isolated in its own file to avoid leaking into other tests
const mockExtractCreate = mock(() =>
  Promise.resolve({ choices: [{ message: { content: "{}" } }] })
);

mock.module("openai", () => ({
  default: class MockOpenAI {
    constructor() {}
    chat = {
      completions: {
        create: mockExtractCreate,
      },
    };
  },
}));

import { extractGraphEntities } from "../src/services/graph.js";

describe("extractGraphEntities", () => {
  beforeEach(() => {
    mockExtractCreate.mockClear();
  });

  test("extracts entities and relations from data", async () => {
    mockExtractCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              entities: [
                { name: "Alice", type: "person", properties: { role: "author" } },
                { name: "TypeScript", type: "concept", properties: {} },
              ],
              relations: [
                { source: "Alice", target: "TypeScript", type: "knows", weight: 0.9 },
              ],
            }),
          },
        },
      ],
    });

    const result = await extractGraphEntities({
      data: { name: "Alice", expertise: "TypeScript" },
      entity_types: ["person", "concept"],
      relation_types: ["knows", "uses"],
    });

    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].name).toBe("Alice");
    expect(result.entities[0].type).toBe("person");
    expect(result.entities[0].properties).toEqual({ role: "author" });
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].source).toBe("Alice");
    expect(result.relations[0].target).toBe("TypeScript");
    expect(result.relations[0].weight).toBe(0.9);
  });

  test("returns defaults for empty response", async () => {
    mockExtractCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{}" } }],
    });

    const result = await extractGraphEntities({
      data: { text: "nothing here" },
      entity_types: ["person"],
      relation_types: ["knows"],
    });

    expect(result.entities).toEqual([]);
    expect(result.relations).toEqual([]);
  });

  test("returns defaults when content is empty", async () => {
    mockExtractCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "" } }],
    });

    const result = await extractGraphEntities({
      data: { text: "no content" },
      entity_types: ["person"],
      relation_types: ["knows"],
    });

    expect(result.entities).toEqual([]);
    expect(result.relations).toEqual([]);
  });

  test("passes correct model and format to OpenAI", async () => {
    mockExtractCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{}" } }],
    });

    await extractGraphEntities({
      data: { name: "test" },
      entity_types: ["person", "org"],
      relation_types: ["knows", "works_for"],
    });

    expect(mockExtractCreate).toHaveBeenCalledTimes(1);
    const call = mockExtractCreate.mock.calls[0][0] as any;
    expect(call.response_format).toEqual({ type: "json_object" });
    expect(call.temperature).toBe(0.1);
    expect(call.messages[0].role).toBe("user");
    const content = call.messages[0].content;
    expect(content).toContain("person, org");
    expect(content).toContain("knows, works_for");
    expect(content).toContain('"name": "test"');
  });

  test("throws on API failure", async () => {
    mockExtractCreate.mockRejectedValueOnce(new Error("API error"));

    await expect(
      extractGraphEntities({
        data: { name: "test" },
        entity_types: ["person"],
        relation_types: ["knows"],
      })
    ).rejects.toThrow("API error");
  });

  test("throws on malformed JSON response", async () => {
    mockExtractCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "not json" } }],
    });

    await expect(
      extractGraphEntities({
        data: { name: "test" },
        entity_types: ["person"],
        relation_types: ["knows"],
      })
    ).rejects.toThrow();
  });
});
