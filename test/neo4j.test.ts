import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";

const mockSessionRun = mock(() =>
  Promise.resolve({
    records: [
      {
        keys: ["id", "name"],
        get: (key: string) => ({ id: 1, name: "Alice" }[key]),
      },
    ],
  })
);
const mockSessionClose = mock(() => Promise.resolve());
const mockExecuteWrite = mock((fn: any) => fn({}));

const mockSession = () => ({
  run: mockSessionRun,
  close: mockSessionClose,
  executeWrite: mockExecuteWrite,
});

const mockDriver = {
  session: mock(() => mockSession()),
  getServerInfo: mock(() => Promise.resolve({ agent: "Neo4j/5.0" })),
};

mock.module("neo4j-driver", () => ({
  default: {
    driver: () => mockDriver,
    auth: { basic: () => {} },
  },
}));

import { runCypher, runInTransaction, initTenantSchema } from "../src/db/neo4j.js";

describe("neo4j database layer", () => {
  const originalUri = process.env.NEO4J_URI;
  const originalUser = process.env.NEO4J_USER;
  const originalPass = process.env.NEO4J_PASSWORD;

  beforeEach(() => {
    mockSessionRun.mockClear();
    mockSessionClose.mockClear();
    mockExecuteWrite.mockClear();
    mockDriver.session.mockClear();
  });

  afterAll(() => {
    process.env.NEO4J_URI = originalUri;
    process.env.NEO4J_USER = originalUser;
    process.env.NEO4J_PASSWORD = originalPass;
  });

  describe("runCypher", () => {
    test("executes query and maps results", async () => {
      const results = await runCypher("MATCH (n) RETURN n");
      expect(results).toEqual([{ id: 1, name: "Alice" }]);
      expect(mockDriver.session).toHaveBeenCalledTimes(1);
      expect(mockSessionRun).toHaveBeenCalledTimes(1);
      expect(mockSessionClose).toHaveBeenCalledTimes(1);
    });

    test("uses specified database", async () => {
      await runCypher("MATCH (n)", {}, "custom-db");
      const call = mockDriver.session.mock.calls[0][0];
      expect(call.database).toBe("custom-db");
    });

    test("passes parameters to query", async () => {
      await runCypher("MATCH (n) WHERE n.id = $id", { id: 42 });
      expect(mockSessionRun).toHaveBeenCalledWith(
        "MATCH (n) WHERE n.id = $id",
        { id: 42 }
      );
    });
  });

  describe("runInTransaction", () => {
    test("executes function in write transaction", async () => {
      const fn = mock(() => Promise.resolve({ created: true }));
      const result = await runInTransaction(fn);
      expect(result).toEqual({ created: true });
      expect(mockDriver.session).toHaveBeenCalledTimes(1);
      expect(mockExecuteWrite).toHaveBeenCalledTimes(1);
      expect(mockSessionClose).toHaveBeenCalledTimes(1);
    });

    test("uses specified database", async () => {
      const fn = mock(() => Promise.resolve({ ok: true }));
      await runInTransaction(fn, "my-db");
      const call = mockDriver.session.mock.calls[0][0];
      expect(call.database).toBe("my-db");
    });

    test("closes session even on error", async () => {
      const fn = mock(() => Promise.reject(new Error("tx failed")));
      await expect(runInTransaction(fn)).rejects.toThrow("tx failed");
      expect(mockSessionClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("initTenantSchema", () => {
    test("creates constraints and indexes", async () => {
      await initTenantSchema();
      // 4 session.run calls: entity_id, entity_tenant, entity_type_idx, entity_name_idx
      expect(mockSessionRun).toHaveBeenCalledTimes(4);
      expect(mockSessionClose).toHaveBeenCalledTimes(1);
    });

    test("uses specified database", async () => {
      mockSessionRun.mockClear();
      mockDriver.session.mockClear();
      await initTenantSchema("tenant-db");
      const call = mockDriver.session.mock.calls[0][0];
      expect(call.database).toBe("tenant-db");
    });
  });
});
