---
name: duckdb-fullstack
description:
  DuckDB for Python data engineering and React analytics applications. Use when working with SQL queries on local/remote data, 
  building full-stack data apps with DuckDB-WASM in the browser, analyzing parquet/csv/json files without a database server, 
  setting up OLAP pipelines with pandas/Polars integration, or creating React components for in-browser analytics. Covers Python 
  API, WASM bindings, extensions (httpfs, json, spatial), and performance optimization for single-node analytics.
references:
  - python-overview
  - python-relational
  - python-data
  - python-advanced
  - wasm-overview
  - wasm-react
  - quick-reference
  - troubleshooting
---

# DuckDB Full-Stack Development

Complete guide for DuckDB in both Python data pipelines and React browser applications.

## Quick Start

**Choose your domain:**

| I want to... | Go to |
|--------------|-------|
| Query data in Python scripts | [Python Overview](references/python-overview.md) |
| Build lazy data pipelines | [Python Relational API](references/python-relational.md) |
| Load CSV/Parquet/JSON | [Python Data Ingestion](references/python-data.md) |
| Add a React analytics dashboard | [WASM + React](references/wasm-react.md) |
| Check syntax quickly | [Quick Reference](references/quick-reference.md) |
| Fix common errors | [Troubleshooting](references/troubleshooting.md) |

## Installation

**Python:**
```bash
pip install duckdb pandas pyarrow
# or with Polars support
pip install duckdb polars pyarrow
```

**React/WASM:**
```bash
npm install @duckdb/duckdb-wasm
```

## Bundled Scripts

This skill includes helper scripts in `scripts/`:

| Script | Purpose |
|--------|---------|
| `validate_sql.py` | Validate DuckDB SQL syntax without executing |
| `generate_types.py` | Generate TypeScript types from SQL queries |

**Usage:**
```bash
# Validate SQL syntax
python scripts/validate_sql.py "SELECT * FROM events WHERE date > '2024-01-01'"

# Generate TypeScript types
python scripts/generate_types.py "SELECT id, name, price FROM products" --name Product --output types.ts
```

## Domain Decision Tree

### When to Use Python API
- Data engineering pipelines
- ETL workflows with pandas/Polars
- Large-scale analytics (10M+ rows)
- Background processing jobs
- Integration with ML workflows

### When to Use WASM (Browser)
- Client-side analytics dashboards
- Data exploration tools
- Privacy-sensitive data (kept in browser)
- Real-time filtering of medium datasets (<1GB)
- Prototyping before Python backend

## Common Patterns

### 1. Connection Management (Python)

```python
import duckdb

# In-memory (fastest for <10GB)
conn = duckdb.connect()

# Persistent database
conn = duckdb.connect("analytics.db")

# Context manager (recommended)
with duckdb.connect("analytics.db") as conn:
    result = conn.execute("SELECT * FROM events").fetchdf()
```

**Critical:** Connections are not thread-safe. Create one connection per thread.

### 2. Querying Different Sources

```python
# CSV files
df = conn.execute("SELECT * FROM 'data.csv' LIMIT 100").fetchdf()

# Parquet files (columnar, faster)
df = conn.execute("SELECT * FROM 'data.parquet'").fetchdf()

# Arrow directly (zero-copy)
arrow_table = conn.execute("SELECT * FROM events").fetch_arrow_table()

# Pandas DataFrame
conn.execute("CREATE TABLE events AS SELECT * FROM df")
```

### 3. React + WASM Setup

```typescript
import * as duckdb from '@duckdb/duckdb-wasm';

// Initialize in useEffect
const initDb = async () => {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {type: 'text/javascript'})
  );
  
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  
  return db;
};
```

## Extensions

Essential extensions for common workflows:

| Extension | Purpose | Install |
|-----------|---------|---------|
| httpfs | S3/HTTPS/GCS access | `INSTALL httpfs; LOAD httpfs;` |
| json | JSON parsing | Built-in (DuckDB 0.10+) |
| parquet | Parquet I/O | Built-in |
| spatial | Geospatial queries | `INSTALL spatial; LOAD spatial;` |
| fts | Full-text search | `INSTALL fts; LOAD fts;` |

### S3/Cloud Example
```sql
INSTALL httpfs;
LOAD httpfs;

SET s3_region='us-east-1';
SET s3_access_key_id='...';
SET s3_secret_access_key='...';

SELECT * FROM 's3://bucket/data.parquet' LIMIT 100;
```

## Performance Tips

1. **Use Parquet for large files** - Columnar format, compression, predicate pushdown
2. **Create indexes on join keys** - `CREATE INDEX idx ON table(column);`
3. **Use the relational API for lazy evaluation** - Build query plans without executing
4. **Batch inserts** - Insert 100K-1M rows at once, not row-by-row
5. **Enable parallel CSV reading** - `SET preserve_insertion_order=false;`

## Reference Selection Guide

**Python developers:**
- New to DuckDB? → [python-overview.md](references/python-overview.md)
- Building complex pipelines? → [python-relational.md](references/python-relational.md)
- Loading data from files? → [python-data.md](references/python-data.md)
- Threading, UDFs, extensions? → [python-advanced.md](references/python-advanced.md)

**React developers:**
- Architecture overview → [wasm-overview.md](references/wasm-overview.md)
- React hooks and patterns → [wasm-react.md](references/wasm-react.md)

**Everyone:**
- Syntax lookup → [quick-reference.md](references/quick-reference.md)
- Error solutions → [troubleshooting.md](references/troubleshooting.md)
- Type generation → Use `scripts/generate_types.py`

## Migration from Other Tools

| From | To DuckDB |
|------|-------------|
| SQLite | Same SQL dialect, faster analytics, better type support |
| pandas | `df = conn.execute("...").fetchdf()` |
| Polars | `pl_df = conn.execute("...").fetch_pl()` |
| PostgreSQL | Most SQL compatible, embedded (no server) |
| BigQuery | Similar SQL, local execution |

## Common Pitfalls

1. **Don't share connections across threads** - Create connection per thread
2. **Don't use f-strings for SQL** - Use parameterized queries
3. **Don't load entire datasets into pandas** - Use Arrow for large data
4. **Don't forget to LOAD extensions** - INSTALL is not enough
5. **Don't rely on insertion order** - Use explicit ORDER BY
