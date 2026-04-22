import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { DatasetSchema } from "../src/types.js";

// Mock OpenAI module — must be registered before importing the module under test
const mockCreate = mock(() =>
  Promise.resolve({ choices: [{ message: { content: "{}" } }] })
);

mock.module("openai", () => ({
  default: class MockOpenAI {
    constructor() {}
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

import { structureData, sanitizeData } from "../src/services/structure.js";

// --- Shared fixtures ---

const sampleSchema: DatasetSchema = {
  fields: [
    { name: "name", type: "string", required: true, description: "Full name" },
    { name: "email", type: "string", required: true, description: "Email address" },
    { name: "age", type: "number", required: false, description: "Age in years" },
  ],
  strict: false,
};

const strictSchema: DatasetSchema = {
  fields: [
    { name: "name", type: "string", required: true, description: "Full name" },
    { name: "email", type: "string", required: true, description: "Email address" },
  ],
  strict: true,
};

beforeEach(() => {
  mockCreate.mockClear();
});

// --- structureData ---

describe("structureData", () => {
  test("extracts structured fields from raw data", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              structured: { name: "John", email: "john@example.com", age: 30 },
              confidence: 0.95,
              fields_extracted: ["name", "email", "age"],
              fields_missing: [],
            }),
          },
        },
      ],
    });

    const result = await structureData({
      raw_data: { text: "John, john@example.com, age 30" },
      dataset_schema: sampleSchema,
    });

    expect(result.structured).toEqual({ name: "John", email: "john@example.com", age: 30 });
    expect(result.confidence).toBe(0.95);
    expect(result.fields_extracted).toEqual(["name", "email", "age"]);
    expect(result.fields_missing).toEqual([]);
  });

  test("reports missing required fields", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              structured: { name: "John" },
              confidence: 0.5,
              fields_extracted: ["name"],
              fields_missing: ["email"],
            }),
          },
        },
      ],
    });

    const result = await structureData({
      raw_data: { text: "Just John" },
      dataset_schema: sampleSchema,
    });

    expect(result.fields_missing).toEqual(["email"]);
    expect(result.confidence).toBe(0.5);
    expect(result.fields_extracted).toEqual(["name"]);
  });

  test("returns defaults when LLM returns empty content", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "" } }],
    });

    const result = await structureData({
      raw_data: { text: "anything" },
      dataset_schema: sampleSchema,
    });

    expect(result.structured).toEqual({});
    expect(result.confidence).toBe(0);
    expect(result.fields_extracted).toEqual([]);
    expect(result.fields_missing).toEqual([]);
  });

  test("returns defaults when LLM returns empty JSON object", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{}" } }],
    });

    const result = await structureData({
      raw_data: { text: "anything" },
      dataset_schema: sampleSchema,
    });

    expect(result.structured).toEqual({});
    expect(result.confidence).toBe(0);
    expect(result.fields_extracted).toEqual([]);
    expect(result.fields_missing).toEqual([]);
  });

  test("passes correct parameters to OpenAI API", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              structured: {},
              confidence: 0,
              fields_extracted: [],
              fields_missing: [],
            }),
          },
        },
      ],
    });

    await structureData({
      raw_data: { text: "test" },
      dataset_schema: sampleSchema,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0] as any;
    expect(call.response_format).toEqual({ type: "json_object" });
    expect(call.temperature).toBe(0.1);
    expect(call.messages[0].role).toBe("user");
    expect(call.messages[0].content).toContain("Schema fields");
    expect(call.messages[0].content).toContain("name");
    expect(call.messages[0].content).toContain("email");
  });

  test("includes strict mode in prompt when schema is strict", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              structured: {},
              confidence: 0,
              fields_extracted: [],
              fields_missing: [],
            }),
          },
        },
      ],
    });

    await structureData({
      raw_data: { text: "test" },
      dataset_schema: strictSchema,
    });

    const call = mockCreate.mock.calls[0][0] as any;
    expect(call.messages[0].content).toContain("Strict mode: yes");
  });

  test("throws on API failure", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API rate limit"));

    expect(
      structureData({
        raw_data: { text: "test" },
        dataset_schema: sampleSchema,
      })
    ).rejects.toThrow("API rate limit");
  });

  test("throws on malformed JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "not valid json" } }],
    });

    expect(
      structureData({
        raw_data: { text: "test" },
        dataset_schema: sampleSchema,
      })
    ).rejects.toThrow();
  });
});

// --- sanitizeData ---

describe("sanitizeData", () => {
  test("sanitizes data and returns clean result", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sanitized: { name: "John", email: "john@example.com" },
              pii_removed: [],
              duplicates_found: 0,
              validation_errors: [],
            }),
          },
        },
      ],
    });

    const result = await sanitizeData({
      data: { name: " John ", email: "john@example.com" },
      dataset_schema: sampleSchema,
      remove_pii: false,
    });

    expect(result.sanitized).toEqual({ name: "John", email: "john@example.com" });
    expect(result.pii_removed).toEqual([]);
    expect(result.duplicates_found).toBe(0);
    expect(result.validation_errors).toEqual([]);
  });

  test("removes PII when remove_pii is true", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sanitized: { name: "J***", email: "[REDACTED]" },
              pii_removed: ["name", "email"],
              duplicates_found: 0,
              validation_errors: [],
            }),
          },
        },
      ],
    });

    const result = await sanitizeData({
      data: { name: "John", email: "john@example.com" },
      dataset_schema: sampleSchema,
      remove_pii: true,
    });

    expect(result.pii_removed).toEqual(["name", "email"]);
  });

  test("includes PII removal instruction in prompt when remove_pii is true", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sanitized: {},
              pii_removed: [],
              duplicates_found: 0,
              validation_errors: [],
            }),
          },
        },
      ],
    });

    await sanitizeData({
      data: { name: "test" },
      dataset_schema: sampleSchema,
      remove_pii: true,
    });

    const call = mockCreate.mock.calls[0][0] as any;
    expect(call.messages[0].content).toContain("Remove or mask personally identifiable information");
  });

  test("includes PII flag instruction when remove_pii is false", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sanitized: {},
              pii_removed: [],
              duplicates_found: 0,
              validation_errors: [],
            }),
          },
        },
      ],
    });

    await sanitizeData({
      data: { name: "test" },
      dataset_schema: sampleSchema,
      remove_pii: false,
    });

    const call = mockCreate.mock.calls[0][0] as any;
    expect(call.messages[0].content).toContain("Leave PII as-is");
  });

  test("reports validation errors", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sanitized: { name: "John", email: "not-an-email", age: "thirty" },
              pii_removed: [],
              duplicates_found: 0,
              validation_errors: ["email: invalid format", "age: expected number, got string"],
            }),
          },
        },
      ],
    });

    const result = await sanitizeData({
      data: { name: "John", email: "not-an-email", age: "thirty" },
      dataset_schema: sampleSchema,
      remove_pii: false,
    });

    expect(result.validation_errors).toEqual(["email: invalid format", "age: expected number, got string"]);
  });

  test("reports duplicates found", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sanitized: { name: "John", email: "john@example.com" },
              pii_removed: [],
              duplicates_found: 3,
              validation_errors: [],
            }),
          },
        },
      ],
    });

    const result = await sanitizeData({
      data: { name: "John", email: "john@example.com" },
      dataset_schema: sampleSchema,
      remove_pii: false,
    });

    expect(result.duplicates_found).toBe(3);
  });

  test("falls back to input data when sanitized is missing", async () => {
    const inputData = { name: "John", email: "john@example.com" };
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              pii_removed: [],
              duplicates_found: 0,
              validation_errors: [],
            }),
          },
        },
      ],
    });

    const result = await sanitizeData({
      data: inputData,
      dataset_schema: sampleSchema,
      remove_pii: false,
    });

    expect(result.sanitized).toEqual(inputData);
  });

  test("returns defaults for empty JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{}" } }],
    });

    const result = await sanitizeData({
      data: { name: "test" },
      dataset_schema: sampleSchema,
      remove_pii: false,
    });

    expect(result.sanitized).toEqual({ name: "test" }); // falls back to input data
    expect(result.pii_removed).toEqual([]);
    expect(result.duplicates_found).toBe(0);
    expect(result.validation_errors).toEqual([]);
  });

  test("passes correct parameters to OpenAI API", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sanitized: {},
              pii_removed: [],
              duplicates_found: 0,
              validation_errors: [],
            }),
          },
        },
      ],
    });

    await sanitizeData({
      data: { name: "test" },
      dataset_schema: sampleSchema,
      remove_pii: false,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0] as any;
    expect(call.response_format).toEqual({ type: "json_object" });
    expect(call.temperature).toBe(0.1);
    expect(call.messages[0].role).toBe("user");
    expect(call.messages[0].content).toContain("sanitization assistant");
  });

  test("throws on API failure", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Network error"));

    expect(
      sanitizeData({
        data: { name: "test" },
        dataset_schema: sampleSchema,
        remove_pii: false,
      })
    ).rejects.toThrow("Network error");
  });

  test("throws on malformed JSON response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "broken { json" } }],
    });

    expect(
      sanitizeData({
        data: { name: "test" },
        dataset_schema: sampleSchema,
        remove_pii: false,
      })
    ).rejects.toThrow();
  });
});
