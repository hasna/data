import { describe, test, expect } from "bun:test";
import { cosineSimilarity, textToSearchable } from "../src/services/vectorize.js";

describe("cosineSimilarity", () => {
  test("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  test("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  test("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  test("returns 0 for different length vectors", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  test("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  test("computes similarity for arbitrary vectors", () => {
    // [1,2,3] . [4,5,6] = 4+10+18=32
    // |[1,2,3]| = sqrt(14), |[4,5,6]| = sqrt(77)
    // 32 / sqrt(14*77) = 32 / sqrt(1078) ≈ 0.9746
    const result = cosineSimilarity([1, 2, 3], [4, 5, 6]);
    expect(result).toBeCloseTo(0.9746, 3);
  });
});

describe("textToSearchable", () => {
  test("converts simple key-value pairs", () => {
    const result = textToSearchable({ name: "Alice", age: 30 });
    expect(result).toContain("name: Alice");
    expect(result).toContain("age: 30");
  });

  test("skips null and undefined values", () => {
    const result = textToSearchable({ name: "Bob", x: null, y: undefined });
    expect(result).toContain("name: Bob");
    expect(result).not.toContain("x:");
    expect(result).not.toContain("y:");
  });

  test("stringifies object values", () => {
    const result = textToSearchable({ meta: { key: "val" } });
    expect(result).toContain('meta: {"key":"val"}');
  });

  test("handles empty object", () => {
    expect(textToSearchable({})).toBe("");
  });
});
