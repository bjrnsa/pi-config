# DuckDB-WASM Overview

Running DuckDB in the browser for client-side analytics.

## Architecture

DuckDB-WASM is DuckDB compiled to WebAssembly (WASM), enabling in-browser SQL analytics without a backend server.

### Key Components

1. **DuckDB Engine** - Core database compiled to WASM
2. **Web Worker** - Runs DuckDB in background thread
3. **JavaScript API** - Async interface for queries
4. **File System** - Virtual file system for data access

### When to Use WASM vs Server

| Use WASM | Use Server |
|----------|------------|
| < 1GB datasets | > 1GB datasets |
| Privacy-sensitive data | Shared data sources |
| Prototyping/MVPs | Production APIs |
| Offline capability | Complex auth requirements |
| Interactive filtering | Write-heavy workloads |
| Client-side caching | Multi-user writes |

## Installation

### NPM Package

```bash
npm install @duckdb/duckdb-wasm
```

### CDN (Simple HTML)

```html
<script type="module">
  import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser.mjs';
  // Use duckdb...
</script>
```

### Bundler Setup (Vite/Webpack)

```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
```

**Note:** COOP/COEP headers are required for SharedArrayBuffer support, which enables multi-threading in WASM.

## Basic Initialization

### Simple Setup

```typescript
import * as duckdb from '@duckdb/duckdb-wasm';

async function initDuckDB() {
  // Select bundle (JSDelivr CDN)
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  
  // Create worker
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {type: 'text/javascript'})
  );
  
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  
  // Instantiate database
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  
  return db;
}

// Usage
const db = await initDuckDB();
const conn = await db.connect();

// Execute query
const result = await conn.query("SELECT 42 as answer");
console.log(result.toArray());

// Cleanup
await conn.close();
await db.terminate();
```

### With Configuration

```typescript
async function initDuckDBWithConfig() {
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING); // Reduce logging
  
  const db = new duckdb.AsyncDuckDB(logger, worker);
  
  // Instantiate with custom config
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker, {
    // Custom configuration
    query: {
      memoryLimit: 1024 * 1024 * 1024, // 1GB
      threadLimit: 4
    }
  });
  
  return db;
}
```

## Connections and Queries

### Connection Management

```typescript
const db = await initDuckDB();

// Single connection
const conn = await db.connect();

// Multiple connections (isolated sessions)
const conn1 = await db.connect();
const conn2 = await db.connect();

// Close when done
await conn.close();
```

### Query Execution

```typescript
const conn = await db.connect();

// Simple query
try {
  const result = await conn.query("SELECT * FROM generate_series(1, 100)");
  console.log(result.toArray());
} catch (error) {
  console.error("Query failed:", error);
}

// Prepared statements (parameterized)
const stmt = await conn.prepare("SELECT * FROM users WHERE id = ?");
const result = await stmt.query(42);
await stmt.close();

// Multiple parameters
const stmt2 = await conn.prepare("SELECT * FROM events WHERE type = ? AND date > ?");
const result2 = await stmt2.query("click", "2024-01-01");
```

### Result Handling

```typescript
const result = await conn.query("SELECT * FROM events");

// Convert to array of objects
const rows = result.toArray();
console.log(rows[0]);
// { id: 1, type: 'click', value: 100 }

// Get schema
const schema = result.schema;
console.log(schema.fields.map(f => f.name));
// ['id', 'type', 'value']

// Access as Arrow table (zero-copy)
const arrowTable = result;
const batch = arrowTable.batches[0];

// Iterate rows
for (const row of result) {
  console.log(row.id, row.type);
}

// Convert to JSON
const json = JSON.stringify(result.toArray());
```

## Loading Data

### From JavaScript Arrays

```typescript
// Insert from array of objects
const data = [
  { id: 1, name: 'Alice', value: 100 },
  { id: 2, name: 'Bob', value: 200 },
  { id: 3, name: 'Charlie', value: 300 }
];

// Create table from data
await db.registerFileText('data.json', JSON.stringify(data));
await conn.query("""
  CREATE TABLE users AS 
  SELECT * FROM read_json_auto('data.json')
""");

// Or use direct insert (simpler for small data)
await conn.query("CREATE TABLE users (id INTEGER, name VARCHAR, value INTEGER)");

for (const row of data) {
  await conn.query(`
    INSERT INTO users VALUES (${row.id}, '${row.name}', ${row.value})
  `);
}
```

### From Files

```typescript
// Load CSV file
const csvContent = `id,name,value
1,Alice,100
2,Bob,200
3,Charlie,300`;

await db.registerFileText('data.csv', csvContent);
await conn.query("CREATE TABLE users AS SELECT * FROM read_csv_auto('data.csv')");

// Load Parquet (binary)
const parquetBuffer = await fetch('/data/users.parquet').then(r => r.arrayBuffer());
await db.registerFileBuffer('data.parquet', new Uint8Array(parquetBuffer));
await conn.query("CREATE TABLE users AS SELECT * FROM read_parquet('data.parquet')");

// Load from URL (with httpfs extension)
await conn.query("INSTALL httpfs;");
await conn.query("LOAD httpfs;");
await conn.query("CREATE TABLE users AS SELECT * FROM 'https://example.com/data.parquet'");
```

### From User Upload

```typescript
// Handle file upload
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Register file in DuckDB
  await db.registerFileBuffer(file.name, uint8Array);
  
  // Create table from file
  if (file.name.endsWith('.csv')) {
    await conn.query(`CREATE TABLE data AS SELECT * FROM read_csv_auto('${file.name}')`);
  } else if (file.name.endsWith('.parquet')) {
    await conn.query(`CREATE TABLE data AS SELECT * FROM read_parquet('${file.name}')`);
  } else if (file.name.endsWith('.json')) {
    await conn.query(`CREATE TABLE data AS SELECT * FROM read_json_auto('${file.name}')`);
  }
  
  // Query the data
  const result = await conn.query("SELECT COUNT(*) as count FROM data");
  console.log(`Loaded ${result.toArray()[0].count} rows`);
});
```

## File System Management

### Virtual File System

```typescript
// List registered files
const files = await db.globFiles("*");
console.log(files);

// Check file info
const fileInfo = await db.getFileInfo('data.parquet');
console.log(fileInfo);

// Delete file
await db.dropFile('data.parquet');

// Delete all files
await db.dropFiles();

// Copy file to virtual FS
const response = await fetch('/api/data.parquet');
const buffer = await response.arrayBuffer();
await db.registerFileBuffer('local.parquet', new Uint8Array(buffer));
```

### File URLs

```typescript
// DuckDB-WASM supports multiple URL schemes:

// 1. Built-in virtual files
await conn.query("SELECT * FROM 'data.parquet'");

// 2. HTTP(S) with httpfs
await conn.query("INSTALL httpfs");
await conn.query("LOAD httpfs");
await conn.query("SELECT * FROM 'https://example.com/data.parquet'");

// 3. S3 with httpfs
await conn.query("SET s3_region='us-east-1'");
await conn.query("SELECT * FROM 's3://bucket/data.parquet'");
```

## Extensions in WASM

### Available Extensions

Not all extensions work in WASM. Common ones that do:

| Extension | WASM Support | Notes |
|-----------|--------------|-------|
| json | ✅ Built-in | |
| parquet | ✅ Built-in | |
| csv | ✅ Built-in | |
| httpfs | ✅ Limited | HTTP only, no S3 |
| fts | ✅ | Full-text search |
| icu | ✅ | Unicode support |
| excel | ✅ | Excel import |
| spatial | ⚠️ Partial | Some features |

### Installing Extensions

```typescript
// Install from official repository
try {
  await conn.query("INSTALL fts");
  await conn.query("LOAD fts");
} catch (error) {
  console.error("Extension load failed:", error);
}

// Install specific version
await conn.query("INSTALL fts FROM 'https://extensions.duckdb.org'");
```

## Configuration

### Memory and Threads

```typescript
await db.instantiate(bundle.mainModule, bundle.pthreadWorker, {
  query: {
    memoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
    threadLimit: 4
  }
});
```

### Logging

```typescript
// Quiet logging
const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR);

// Verbose logging
const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.DEBUG);

const db = new duckdb.AsyncDuckDB(logger, worker);
```

## Performance Tips

### 1. Use Parquet Format

```typescript
// CSV is slow to parse in WASM
// Convert to Parquet for better performance

// In Python/backend:
// df.to_parquet('data.parquet', compression='zstd')

// In browser:
await db.registerFileBuffer('data.parquet', parquetBuffer);
await conn.query("SELECT * FROM read_parquet('data.parquet')");
```

### 2. Limit Memory Copies

```typescript
// Bad: Multiple conversions
const jsonData = JSON.stringify(data);
const parsed = JSON.parse(jsonData);
await db.registerFileText('data.json', JSON.stringify(parsed));

// Good: Direct buffer transfer
await db.registerFileBuffer('data.parquet', parquetBuffer);
```

### 3. Batch Large Inserts

```typescript
// Bad: Row-by-row
for (const row of largeData) {
  await conn.query(`INSERT INTO table VALUES (${row.id}, '${row.name}')`);
}

// Good: Batch insert via JSON
await db.registerFileText('data.json', JSON.stringify(largeData));
await conn.query("INSERT INTO table SELECT * FROM read_json_auto('data.json')");
```

### 4. Use Prepared Statements

```typescript
// Good: Reuse prepared statement
const stmt = await conn.prepare("SELECT * FROM users WHERE id = ?");
for (const id of userIds) {
  const result = await stmt.query(id);
  // Process result
}
await stmt.close();
```

## Error Handling

```typescript
async function safeQuery(conn: duckdb.AsyncDuckDBConnection, sql: string) {
  try {
    return await conn.query(sql);
  } catch (error) {
    if (error instanceof duckdb.DuckDBError) {
      console.error("DuckDB Error:", error.message);
      
      // Handle specific errors
      if (error.message.includes("Out of Memory")) {
        throw new Error("Query exceeded memory limit. Try filtering or aggregating.");
      }
      if (error.message.includes("Table not found")) {
        throw new Error("Table does not exist. Check your data loading.");
      }
    }
    throw error;
  }
}
```

## Browser Compatibility

### Required Features

- WebAssembly (WASM)
- SharedArrayBuffer (for multi-threading)
- BigInt64Array (for 64-bit integers)
- TextEncoder/TextDecoder

### COOP/COEP Headers

For SharedArrayBuffer support, serve with these headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Vite Dev Server

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
```

### Next.js

```javascript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin'
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp'
          }
        ]
      }
    ];
  }
};
```

## Debugging

### Query Plans

```typescript
const plan = await conn.query("EXPLAIN SELECT * FROM events");
console.log(plan.toArray());
```

### Memory Usage

```typescript
// Check DuckDB memory
const memory = await conn.query("SELECT current_setting('memory_limit')");
console.log("Memory limit:", memory.toArray()[0]);
```

### Profiling

```typescript
await conn.query("SET enable_profiling = 'json'");
await conn.query("SELECT * FROM large_table");
// Profile output goes to console
```

## Cleanup

```typescript
// Proper cleanup sequence
await conn.close();     // Close connection
await db.terminate();   // Terminate worker
URL.revokeObjectURL(worker_url);  // Clean up worker URL
```
