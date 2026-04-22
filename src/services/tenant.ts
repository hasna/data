import { randomUUID } from "node:crypto";
import { getDb } from "../db/sqlite.js";
import { deleteDataset } from "./dataset.js";
import {
  Tenant,
  CreateTenantInput,
  TenantSettings,
  DEFAULT_TENANT_SETTINGS,
} from "../types.js";

function rowToTenant(row: any): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    settings: JSON.parse(row.settings),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createTenant(input: CreateTenantInput): Tenant {
  const db = getDb();
  const id = `tenant_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const settings: TenantSettings = { ...DEFAULT_TENANT_SETTINGS, ...input.settings };

  db.query(
    `INSERT INTO tenants (id, name, slug, type, settings) VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.name, input.slug, input.type, JSON.stringify(settings));

  return getTenant(id)!;
}

export function getTenant(id: string): Tenant | null {
  const db = getDb();
  const row = db.query("SELECT * FROM tenants WHERE id = ?").get(id) as any;
  return row ? rowToTenant(row) : null;
}

export function getTenantBySlug(slug: string): Tenant | null {
  const db = getDb();
  const row = db.query("SELECT * FROM tenants WHERE slug = ?").get(slug) as any;
  return row ? rowToTenant(row) : null;
}

export function listTenants(): Tenant[] {
  const db = getDb();
  const rows = db.query("SELECT * FROM tenants ORDER BY created_at DESC").all() as any[];
  return rows.map(rowToTenant);
}

export function updateTenant(id: string, updates: Partial<Pick<Tenant, "name" | "type" | "settings">>): Tenant | null {
  const db = getDb();
  const tenant = getTenant(id);
  if (!tenant) return null;

  const name = updates.name ?? tenant.name;
  const type = updates.type ?? tenant.type;
  const settings = updates.settings ? { ...tenant.settings, ...updates.settings } : tenant.settings;

  db.query(
    `UPDATE tenants SET name = ?, type = ?, settings = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name, type, JSON.stringify(settings), id);

  return getTenant(id);
}

export function deleteTenant(id: string): boolean {
  const db = getDb();
  // Cascade: delete all datasets (which cascade to records, entities, relations)
  const datasets = db.query("SELECT id FROM datasets WHERE tenant_id = ?").all(id) as any[];
  for (const ds of datasets) {
    deleteDataset(ds.id);
  }
  const result = db.query("DELETE FROM tenants WHERE id = ?").run(id);
  return result.changes > 0;
}
