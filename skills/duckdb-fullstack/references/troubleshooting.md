# Troubleshooting DuckDB

Quick solutions for common DuckDB errors and issues.

---

## Python Issues

### "duckdb module not found"
```bash
# Fix: Install duckdb
pip install duckdb

# For specific version
pip install duckdb==1.0.0
```

### "Connection is already closed"
```python
# Wrong: Connection closed before use
con = duckdb.connect()
con.close()
result = con.execute("SELECT 1")  # Error!

# Fix: Use context manager
with duckdb.connect() as con:
    result = con.execute("SELECT 1").fetchall()
```

### "Cannot execute multiple queries at once"
```python
# Wrong: Multiple statements
con.execute("SELECT 1; SELECT 2;")  # Error!

# Fix: Execute separately or use .sql() for read-only
con.execute("SELECT 1")
con.execute("SELECT 2")

# Or use sql() for queries that return results
result = con.sql("SELECT 1 UNION ALL SELECT 2")
```

### Threading errors / crashes
```python
# Wrong: Sharing connection across threads
import threading

con = duckdb.connect()

def worker():
    con.execute("INSERT INTO t VALUES (1)")  # CRASH!

# Fix: Create connection per thread
def worker():
    con = duckdb.connect("my.db")  # Each thread gets own connection
    con.execute("INSERT INTO t VALUES (1)")
    con.close()
```

### "No module named 'pandas'" when using .df()
```bash
# Fix: Install pandas
pip install pandas

# Or use fetchall() for pure Python
result = con.execute("SELECT * FROM t").fetchall()
```

### Out of memory on large queries
```python
# Wrong: Loading everything into memory
large_df = con.execute("SELECT * FROM huge_table").fetchdf()  # OOM!

# Fix 1: Use Arrow for streaming
arrow_reader = con.execute("SELECT * FROM huge_table").fetch_arrow_reader()
for batch in arrow_reader:
    process(batch)

# Fix 2: Process in chunks
offset = 0
chunk_size = 100000
while True:
    chunk = con.execute(f"SELECT * FROM huge_table LIMIT {chunk_size} OFFSET {offset}").fetchdf()
    if len(chunk) == 0:
        break
    process(chunk)
    offset += chunk_size
```

### "Invalid Input Error: Unsupported type" with parameters
```python
# Wrong: Params with sql()
con.sql("SELECT * FROM t WHERE id = ?", params=[1])  # Slow, 5x overhead

# Fix: Use execute() for parameters
con.execute("SELECT * FROM t WHERE id = ?", [1])

# For multiple rows
con.executemany("INSERT INTO t VALUES (?)", [[1], [2], [3]])
```

---

## React / WASM Issues

### "SharedArrayBuffer is not defined"
**Cause:** Missing COOP/COEP headers.

**Fix for Vite:**
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

**Fix for production:**
Add headers to your web server (nginx, Apache, etc.)

### "Failed to fetch" when loading DuckDB-WASM
**Cause:** CDN blocked or network issues.

**Fix:** Use local bundles
```typescript
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

const bundles = {
  mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
};
```

### Memory leaks / "Out of memory"
**Cause:** Not cleaning up resources.

**Fix:** Always cleanup
```typescript
useEffect(() => {
  let db: AsyncDuckDB | null = null;
  let worker: Worker | null = null;
  
  const init = async () => {
    // ... init code
  };
  init();
  
  return () => {
    // Cleanup is critical!
    db?.terminate();
    worker?.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
  };
}, []);
```

### CORS errors when loading remote data
**Cause:** Server doesn't allow cross-origin requests.

**Fix:** Enable CORS on your S3 bucket / API:
```json
{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "MaxAgeSeconds": 3000
  }]
}
```

Or use a proxy for development:
```typescript
// Instead of direct URL
const proxyUrl = `/api/proxy?url=${encodeURIComponent(dataUrl)}`;
await db.registerFileURL('data.parquet', proxyUrl);
```

### "RuntimeError: memory access out of bounds"
**Cause:** Trying to load files >4GB (WASM limit).

**Fix:** Use chunked loading or server-side processing
```typescript
// Load only what you need
const conn = await db.connect();
await conn.query(`
  CREATE TABLE sample AS 
  SELECT * FROM read_parquet('large.parquet') 
  USING SAMPLE 10%  -- Load 10% sample
`);
```

---

## SQL Issues

### "Binder Error: Table does not exist"
```sql
-- Wrong: Table not created
SELECT * FROM events;  -- Error!

-- Fix: Create table first or use CREATE OR REPLACE
CREATE TABLE events AS SELECT * FROM 'events.csv';

-- Or use read_csv_auto directly
SELECT * FROM read_csv_auto('events.csv');
```

### "Parser Error: syntax error"
Common causes:
- Missing quotes around string literals
- Reserved words as column names without quotes

```sql
-- Wrong
SELECT order, date FROM orders;  -- 'order' is reserved

-- Fix: Use quotes
SELECT "order", date FROM orders;

-- Or use different column names
SELECT order_id, date FROM orders;
```

### "Invalid Input Error: Malformed CSV"
```sql
-- Fix: Use ignore_errors option
SELECT * FROM read_csv_auto('messy.csv', ignore_errors=true);

-- Or specify columns manually
SELECT * FROM read_csv('messy.csv', 
  columns={'id': 'INTEGER', 'name': 'VARCHAR'},
  header=true
);
```

### "Out of Range Error" with dates
```sql
-- Wrong: Date out of valid range
SELECT '1800-01-01'::DATE;  -- Error!

-- Fix: DuckDB supports 0001-01-01 to 9999-12-31
-- Check your data - likely an invalid sentinel value
SELECT CASE 
  WHEN date_str < '0001-01-01' THEN NULL 
  ELSE date_str::DATE 
END;
```

### Slow queries on large CSVs
```sql
-- Fix 1: Convert to Parquet first
COPY (SELECT * FROM 'large.csv') TO 'large.parquet' (FORMAT PARQUET);

-- Fix 2: Disable parallel if CSV has complex escaping
SET preserve_insertion_order = true;

-- Fix 3: Create indexes after loading
CREATE TABLE data AS SELECT * FROM 'large.csv';
CREATE INDEX idx_date ON data(event_date);
```

---

## Extension Issues

### "Extension not found" / "HTTP Error"
```sql
-- Fix: Check extension name and repository
INSTALL httpfs FROM core;  -- Built-in extensions
INSTALL h3 FROM community; -- Community extensions

-- Then always LOAD
LOAD httpfs;
```

### httpfs not working with S3
```sql
-- Fix: Set correct region and credentials
SET s3_region='us-east-1';
SET s3_access_key_id='AKIA...';
SET s3_secret_access_key='...';

-- Or use session token for temporary credentials
SET s3_session_token='...';

-- Test with simple query
SELECT * FROM 's3://bucket/test.parquet' LIMIT 1;
```

### spatial extension installation fails
```bash
# Fix: May need additional dependencies on Linux
sudo apt-get install libgeos-dev  # Ubuntu/Debian

# Or use conda
conda install -c conda-forge duckdb-spatial
```

---

## Performance Issues

### Query is unexpectedly slow
```sql
-- Check query plan
EXPLAIN ANALYZE SELECT * FROM t WHERE x = 1;

-- Common fixes:
-- 1. Add index
CREATE INDEX idx_x ON t(x);

-- 2. Check file format - convert CSV to Parquet
COPY (SELECT * FROM 'slow.csv') TO 'fast.parquet';

-- 3. Update statistics
ANALYZE;

-- 4. Increase memory limit
SET memory_limit = '8GB';
```

### "Too many open files"
```bash
# Fix: Increase ulimit
ulimit -n 4096

# Or in Python
import resource
resource.setrlimit(resource.RLIMIT_NOFILE, (4096, 4096))
```

---

## Windows-Specific Issues

### "DLL load failed"
**Fix:** Install Visual C++ Redistributable
```powershell
# Download from Microsoft and install
# https://aka.ms/vs/17/release/vc_redist.x64.exe
```

Or use conda:
```bash
conda install -c conda-forge python-duckdb
```

---

## Debug Checklist

When something doesn't work:

1. **Check DuckDB version**
   ```python
   import duckdb
   print(duckdb.__version__)
   ```

2. **Verify extensions are loaded**
   ```sql
   SELECT extension_name, loaded FROM duckdb_extensions();
   ```

3. **Check current settings**
   ```sql
   SELECT * FROM duckdb_settings() WHERE value != '';
   ```

4. **Validate SQL syntax**
   ```bash
   # Use the bundled script
   python scripts/validate_sql.py "YOUR QUERY"
   ```

5. **Check table schema**
   ```sql
   DESCRIBE your_table;
   -- or
   SELECT * FROM information_schema.columns WHERE table_name = 'your_table';
   ```

---

## Getting Help

If issues persist:

1. **DuckDB Documentation:** https://duckdb.org/docs/
2. **GitHub Issues:** https://github.com/duckdb/duckdb/issues
3. **Discord:** https://discord.gg/tcvwpjfnZx
4. **Stack Overflow:** Tag with `duckdb`

Include when reporting:
- DuckDB version
- Operating system
- Minimal reproducible example
- Full error message
