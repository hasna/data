# @hasna/data

Structured data indexing with local knowledge graphs. A CLI, MCP server, REST API, and TypeScript SDK for managing tenants, datasets, records, and graph-based knowledge with vector search.

## Architecture

```
@hasna/data
├── CLI (data)       — 44 commands via commander + ink TUI
├── MCP Server       — 43 tools for AI agent integration
├── REST API         — 40+ routes via Bun.serve
├── SDK              — TypeScript library with full API coverage
└── Library exports  — Import services, types, and utilities directly
```

**Storage layers:**
- **SQLite** — Metadata (tenants, datasets, records, vectors)
- **Neo4j** — Knowledge graph (entities, relations, paths)
- **OpenAI** — Embeddings (text-embedding-3-small) and structuring (gpt-4o-mini)

## Installation

```bash
npm install @hasna/data
# or
bun add @hasna/data
```

Three binaries are available:

| Binary | Purpose |
|--------|---------|
| `data` | CLI for tenant, dataset, record, graph, and search operations |
| `data-mcp` | MCP server for AI agent integration |
| `data-serve` | REST API server |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DB_PATH` | `~/.hasna/data/metadata.db` | SQLite database path |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | — | Neo4j password |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI API base URL |
| `PORT` | `4100` | REST API server port |
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

## CLI Usage

### Tenants

```bash
data tenants list                          # List all tenants
data tenants create --name "My Org" --slug my-org
data tenants get <id>                      # Get tenant by ID
data tenants get-by-slug my-org            # Get tenant by slug
data tenants update <id> --name "New Name"
data tenants delete <id>
```

### Datasets

```bash
data datasets list --tenant-id <id>
data datasets create --tenant-id <id> --name "My Dataset"
data datasets get <id>
data datasets update <id> --name "Updated Name"
data datasets delete <id>
```

### Records

```bash
data records create --dataset-id <id> --tenant-id <id> --data '{"text": "hello"}'
data records list --dataset-id <id> [--status pending] [--limit 20]
data records count --dataset-id <id>
data records get <id>
data records update-status <id> --status complete
data records update-data <id> --data '{"text": "updated"}'
data records delete <id>
data records delete-all --dataset-id <id>
data records process <id>                  # Run full pipeline (structure → sanitize → vectorize → graph)
```

### Graph

```bash
data graph entities --dataset-id <id> [--type person]
data graph relations --dataset-id <id>
data graph create-entity --tenant-id <id> --dataset-id <id> --type person --name "Alice"
data graph create-relation --tenant-id <id> --type knows --source <id> --target <id>
data graph entity <id>
data graph relation <id>
data graph delete-entity <id>
data graph delete-relation <id>
data graph delete-all --dataset-id <id>
data graph neighbors --tenant-id <id> --entity-id <id> [--depth 2]
data graph path --tenant-id <id> --start-type person --start-name "Alice" --end-type concept --end-name "ML"
data graph extract --data '{"text": "..."}' --entity-types person,concept --relation-types knows,mentions
```

### Search

```bash
data search "hello world" --tenant-id <id> [--search-type vector|graph|hybrid] [--datasets id1,id2] [--limit 10]
```

### Structure & Sanitize

```bash
data structure --raw-data '{"note": "..."}' --schema '{"fields": [{"name": "title", "type": "string"}]}'
data sanitize --data '{"name": "John", "email": "john@example.com"}' --schema '...'
```

### Vectorize

```bash
data vectorize "text one" "text two" [--model text-embedding-3-small]
data vectorize similarity --a '[1,0,0]' --b '[0,1,0]'
```

### Ingest

```bash
data ingest --tenant-id <id> --dataset-id <id> --data '{"text": "..."}' [--auto-process]
```

### Status

```bash
data status                              # Show server health, DB, Neo4j, and OpenAI status
```

## MCP Server

Start the MCP server:

```bash
data-mcp
```

Exposes 43 tools across: tenants (6), datasets (5), records (8), graph (12), search (1), vectorize/similarity (4), ingest (1), process (1), extract (1), structure (1), sanitize (1).

Compatible with any MCP client. Configure in your AI agent settings:

```json
{
  "mcpServers": {
    "data": {
      "command": "data-mcp"
    }
  }
}
```

## REST API

Start the server:

```bash
data-serve
# Server running on http://localhost:4100
```

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |
| GET/POST/PATCH/DELETE | `/api/tenants` | Tenant CRUD |
| GET | `/api/tenants/slug/:slug` | Get tenant by slug |
| GET/POST/PATCH/DELETE | `/api/datasets` | Dataset CRUD |
| GET/POST/PATCH/DELETE | `/api/records` | Record CRUD |
| GET | `/api/records/count` | Record counts by status |
| POST | `/api/records/:id/process` | Process a record |
| DELETE | `/api/records/dataset` | Delete all records by dataset |
| POST | `/api/ingest` | Ingest data |
| POST | `/api/search` | Unified search (vector/graph/hybrid) |
| GET | `/api/search/vector` | Vector search (GET) |
| GET/POST/PATCH/DELETE | `/api/graph/entities` | Entity CRUD |
| GET/POST/DELETE | `/api/graph/relations` | Relation CRUD |
| POST | `/api/graph/paths` | Find paths between entities |
| POST | `/api/graph/neighbors` | Get entity neighbors |
| POST | `/api/graph/extract` | Extract graph entities from data |
| POST | `/api/structure` | Structure raw data |
| POST | `/api/sanitize` | Sanitize data (PII removal, validation) |
| POST | `/api/vectorize` | Generate embeddings |
| POST | `/api/vectorize/similarity` | Cosine similarity |

## SDK

```typescript
import { OpenData } from "@hasna/data/sdk";

const client = new OpenData();

// Tenants
const tenant = client.tenants.create({ name: "My Org", slug: "my-org" });

// Datasets
const dataset = client.datasets.create({ tenant_id: tenant.id, name: "Notes" });

// Records
const record = client.records.create(dataset.id, tenant.id, { text: "Hello world" });

// Process through full pipeline
await client.processRecord(record.id);

// Search
const results = await client.search.vector({ tenant_id: tenant.id, query: "hello" });

// Graph
const entities = client.graph.entities(dataset.id);
const paths = await client.graph.paths(tenant.id, "person", "Alice", "concept", "ML");

// Cleanup
client.close();
```

## Library API

Import services directly for programmatic access:

```typescript
import { createTenant, createDataset, createRecord, search } from "@hasna/data";

const tenant = createTenant({ name: "Test", slug: "test", type: "personal" });
const dataset = createDataset({ tenant_id: tenant.id, name: "Dataset" });
const record = createRecord(dataset.id, tenant.id, { text: "data" });
```

## Data Pipeline

Records flow through a 5-stage pipeline:

```
pending → structured → sanitized → vectorized → graphed → complete
```

1. **Structure** — LLM extracts unstructured data into typed fields
2. **Sanitize** — PII removal, duplicate detection, validation
3. **Vectorize** — OpenAI embeddings stored in SQLite
4. **Graph** — Entity/relation extraction, stored in Neo4j
5. **Complete** — All stages finished

## Development

```bash
bun install          # Install dependencies
bun run build        # Build all binaries
bun run typecheck    # Type check
bun run test         # Run tests (349 tests across 15 files)
bun run dev:cli      # Run CLI in development mode
bun run dev:mcp      # Run MCP server in development mode
bun run dev:serve    # Run REST API in development mode
```

## License

Apache-2.0
