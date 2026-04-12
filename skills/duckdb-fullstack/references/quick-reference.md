# DuckDB Quick Reference

Essential syntax and commands for quick lookup.

## Installation

```bash
# Python
pip install duckdb pandas pyarrow

# React/WASM
npm install @duckdb/duckdb-wasm
```

## Python Quick Start

```python
import duckdb

# Connect
conn = duckdb.connect()           # In-memory
conn = duckdb.connect("file.db")  # Persistent

# Query
result = conn.execute("SELECT * FROM table").fetchdf()

# Close
conn.close()
```

## Connection Methods

```python
# Fetch methods
cursor.fetchone()        # Single row
cursor.fetchall()        # All rows as tuples
cursor.fetchdf()         # Pandas DataFrame
cursor.fetch_pl()        # Polars DataFrame
cursor.fetch_arrow_table()      # Arrow Table
cursor.fetch_arrow_reader()     # Streaming reader
cursor.fetchnumpy()      # NumPy arrays

# Relational API
rel = conn.table("name")
rel = conn.sql("SELECT ...")
rel = conn.from_df(df)
```

## SQL Syntax

### DDL

```sql
-- Create table
CREATE TABLE t (id INTEGER PRIMARY KEY, name VARCHAR);
CREATE TEMP TABLE t (...);          -- Session-scoped
CREATE TABLE t AS SELECT ...;        -- From query

-- Alter table
ALTER TABLE t ADD COLUMN col INTEGER;
ALTER TABLE t DROP COLUMN col;

-- Indexes
CREATE INDEX idx ON t(col);
CREATE UNIQUE INDEX idx ON t(col);
DROP INDEX idx;

-- Views
CREATE VIEW v AS SELECT ...;
CREATE TEMP VIEW v AS SELECT ...;

-- Cleanup
DROP TABLE [IF EXISTS] t;
DROP VIEW [IF EXISTS] v;
TRUNCATE TABLE t;
```

### DML

```sql
-- Insert
INSERT INTO t VALUES (1, 'a'), (2, 'b');
INSERT INTO t SELECT * FROM src;

-- Update
UPDATE t SET col = 'value' WHERE id = 1;
UPDATE t SET col1 = val1, col2 = val2 WHERE condition;

-- Delete
DELETE FROM t WHERE condition;
DELETE FROM t;  -- All rows

-- Merge (UPSERT)
MERGE INTO target AS t
USING source AS s
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET t.val = s.val
WHEN NOT MATCHED THEN INSERT (id, val) VALUES (s.id, s.val);
```

### Querying

```sql
-- Basic
SELECT * FROM t;
SELECT col1, col2 FROM t WHERE condition;
SELECT DISTINCT col FROM t;
SELECT * FROM t LIMIT 100 OFFSET 50;

-- Ordering
SELECT * FROM t ORDER BY col DESC;
SELECT * FROM t ORDER BY col1, col2 DESC;

-- Aggregation
SELECT col, COUNT(*), AVG(val), SUM(val), MIN(val), MAX(val)
FROM t
GROUP BY col
HAVING COUNT(*) > 10;

-- Joins
SELECT * FROM a JOIN b ON a.id = b.id;
SELECT * FROM a LEFT JOIN b ON a.id = b.id;
SELECT * FROM a CROSS JOIN b;
SELECT * FROM a, b WHERE a.id = b.id;  -- Implicit join

-- Subqueries
SELECT * FROM t WHERE id IN (SELECT id FROM other);
SELECT * FROM t WHERE EXISTS (SELECT 1 FROM other WHERE ...);
SELECT * FROM (SELECT * FROM t WHERE x > 0) sub;

-- CTEs (Common Table Expressions)
WITH cte AS (SELECT * FROM t WHERE x > 0)
SELECT * FROM cte;

WITH RECURSIVE cte AS (...)  -- Recursive CTE
SELECT * FROM cte;

-- Window functions
SELECT 
  col,
  ROW_NUMBER() OVER (ORDER BY col) as rn,
  RANK() OVER (ORDER BY col) as rank,
  SUM(val) OVER (PARTITION BY group_col ORDER BY col) as running_total,
  AVG(val) OVER (PARTITION BY group_col ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg,
  LAG(col, 1) OVER (ORDER BY col) as prev_val,
  LEAD(col, 1) OVER (ORDER BY col) as next_val,
  FIRST_VALUE(col) OVER (PARTITION BY group_col ORDER BY col) as first_val,
  LAST_VALUE(col) OVER (PARTITION BY group_col ORDER BY col ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) as last_val
FROM t;

-- Set operations
SELECT * FROM a UNION SELECT * FROM b;        -- Distinct
SELECT * FROM a UNION ALL SELECT * FROM b;    -- With duplicates
SELECT * FROM a INTERSECT SELECT * FROM b;
SELECT * FROM a EXCEPT SELECT * FROM b;
```

### Filtering & Conditions

```sql
-- Comparisons
=, !=, <>, <, >, <=, >=

-- Pattern matching
col LIKE 'pattern%'      -- Starts with
col LIKE '%pattern'      -- Ends with
col LIKE '%pattern%'     -- Contains
col SIMILAR TO 'regex'   -- Regex
regexp_matches(col, 'pattern')

-- Null checks
col IS NULL
col IS NOT NULL
col IS DISTINCT FROM other  -- NULL-safe equality

-- Ranges
col BETWEEN a AND b
col IN (val1, val2, val3)

-- Logical
condition1 AND condition2
condition1 OR condition2
NOT condition
```

## Data Types

```sql
-- Numeric
INTEGER, BIGINT, SMALLINT, TINYINT
FLOAT, DOUBLE, DECIMAL(precision, scale), HUGEINT

-- String
VARCHAR, BLOB, BIT

-- Temporal
DATE, TIME, TIMESTAMP, TIMESTAMPTZ, INTERVAL

-- Logical
BOOLEAN

-- Complex
INTEGER[], VARCHAR[]              -- Arrays
MAP(K, V)                         -- Maps
STRUCT(f1 T1, f2 T2)              -- Structs
UNION(t1 T1, t2 T2)               -- Unions

-- Special
UUID, JSON, ENUM('a', 'b', 'c')
```

### Type Conversions

```sql
CAST(col AS INTEGER)
col::INTEGER
col::VARCHAR
TRY_CAST(col AS INTEGER)  -- Returns NULL on failure
```

## Functions

### Numeric

```sql
ABS(x), SIGN(x)
ROUND(x, decimals), TRUNC(x)
CEIL(x), FLOOR(x)
POWER(x, y), SQRT(x), CBRT(x)
EXP(x), LN(x), LOG10(x), LOG2(x)
PI(), E()
SIN(x), COS(x), TAN(x), ASIN(x), ACOS(x), ATAN(x), ATAN2(y, x)
RANDOM(), SETSEED(x)
```

### String

```sql
LENGTH(s), CHAR_LENGTH(s)
LOWER(s), UPPER(s)
TRIM(s), LTRIM(s), RTRIM(s)
SUBSTRING(s, start, len), LEFT(s, n), RIGHT(s, n)
REPLACE(s, old, new)
CONCAT(s1, s2, ...), s1 || s2
POSITION(sub IN s), STRPOS(s, sub)
SPLIT_PART(s, delimiter, part)
REGEXP_MATCHES(s, pattern), REGEXP_REPLACE(s, pattern, replacement)
MD5(s), SHA256(s)
```

### Temporal

```sql
CURRENT_DATE, CURRENT_TIME, CURRENT_TIMESTAMP, NOW()
EXTRACT(year FROM timestamp), EXTRACT(month FROM ...), EXTRACT(day FROM ...)
EXTRACT(hour FROM ...), EXTRACT(minute FROM ...), EXTRACT(second FROM ...)
EXTRACT(dow FROM ...), EXTRACT(week FROM ...), EXTRACT(doy FROM ...)
DATE_TRUNC('month', timestamp), DATE_TRUNC('day', ...)
AGE(timestamp), AGE(timestamp, timestamp2)
INTERVAL '1 day', INTERVAL '2 hours', INTERVAL '30 minutes'
timestamp + INTERVAL '1 day'
timestamp - INTERVAL '1 day'
```

### Arrays

```sql
ARRAY[1, 2, 3]
ARRAY_LENGTH(arr)
ARRAY_CONTAINS(arr, element)
ARRAY_POSITION(arr, element)
ARRAY_AGG(col) ORDER BY col  -- Aggregation to array
UNNEST(arr)                  -- Explode array to rows
arr[1]                       -- Index (1-based)
slice(arr, start, end)
```

### JSON

```sql
-- Creation
json_object('key', value)
json_array(val1, val2, ...)
to_json(val)

-- Extraction
json->>'key'                 -- Get string value
json->'key'                  -- Get JSON value
json_extract(json, '$.key')
json_extract_string(json, '$.key')
json_extract_path(json, 'key1', 'key2')

-- Other
json_type(json)
json_valid(json)
json_pretty(json)
```

### Aggregation

```sql
COUNT(*), COUNT(col), COUNT(DISTINCT col)
SUM(col), AVG(col), MEAN(col)
MIN(col), MAX(col)
STDDEV_SAMP(col), STDDEV_POP(col)
VAR_SAMP(col), VAR_POP(col)
BOOL_AND(col), BOOL_OR(col)
STRING_AGG(col, separator), GROUP_CONCAT(col, separator)
ARRAY_AGG(col)
LIST(col)
FIRST(col), LAST(col)
MODE(col)                    -- Most frequent value
MEDIAN(col)
QUANTILE(col, 0.5)           -- Any quantile
APPROX_COUNT_DISTINCT(col)   -- HyperLogLog
```

### Window Functions

```sql
ROW_NUMBER() OVER (...)
RANK() OVER (...)
DENSE_RANK() OVER (...)
PERCENT_RANK() OVER (...)
CUME_DIST() OVER (...)
NTILE(n) OVER (...)
LAG(col, offset, default) OVER (...)
LEAD(col, offset, default) OVER (...)
FIRST_VALUE(col) OVER (...)
LAST_VALUE(col) OVER (...)
NTH_VALUE(col, n) OVER (...)
```

## File I/O

### Reading

```sql
-- CSV
SELECT * FROM 'file.csv';
SELECT * FROM read_csv_auto('file.csv');
SELECT * FROM read_csv('file.csv', header=true, delimiter=',', columns={'col1': 'INTEGER', 'col2': 'VARCHAR'});

-- Parquet
SELECT * FROM 'file.parquet';
SELECT * FROM read_parquet('file.parquet', hive_partitioning=true, filename=true);
SELECT * FROM read_parquet('*.parquet');

-- JSON
SELECT * FROM 'file.json';
SELECT * FROM read_json_auto('file.json');
SELECT * FROM read_json_auto('file.jsonl', format='newline_delimited');

-- HTTP/S3 (requires httpfs)
SELECT * FROM 'https://example.com/file.parquet';
SELECT * FROM 's3://bucket/file.parquet';
```

### Writing

```sql
-- CSV
COPY (SELECT * FROM t) TO 'file.csv' (HEADER, DELIMITER ',');

-- Parquet
COPY (SELECT * FROM t) TO 'file.parquet' (FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 100000);
COPY (SELECT * FROM t) TO 'output/' (FORMAT PARQUET, PARTITION_BY (year, month), OVERWRITE_OR_IGNORE);

-- JSON
COPY (SELECT * FROM t) TO 'file.json';
COPY (SELECT * FROM t) TO 'file.json' (ARRAY);

-- Database
EXPORT DATABASE 'target_dir';
EXPORT DATABASE 'target_dir' (FORMAT PARQUET, COMPRESSION ZSTD);
```

## Table Functions

```sql
-- Generate series
SELECT * FROM generate_series(1, 10);
SELECT * FROM generate_series('2024-01-01'::DATE, '2024-12-31'::DATE, INTERVAL '1 day');

-- Range
SELECT * FROM range(10);
SELECT * FROM range(5, 10, 2);

-- Unnest
SELECT * FROM UNNEST([1, 2, 3]);
SELECT unnest, other_col FROM t, UNNEST(t.arr);
```

## Extensions

```sql
-- Install and load
INSTALL httpfs;
LOAD httpfs;

INSTALL spatial;
LOAD spatial;

-- List
SELECT * FROM duckdb_extensions();

-- Configure S3
SET s3_region='us-east-1';
SET s3_access_key_id='...';
SET s3_secret_access_key='...';
SET s3_session_token='...';
```

## Configuration

```sql
-- Memory and threads
SET memory_limit = '4GB';
SET threads = 8;
SET preserve_insertion_order = false;
SET temp_directory = '/tmp/duckdb';

-- CSV
SET preserve_insertion_order = false;  -- Parallel CSV reading
SET csv_buffer_size = 1048576;

-- Query behavior
SET enable_progress_bar = true;
SET enable_profiling = 'json';
SET profiling_output = 'profile.json';
SET log_query_path = 'queries.log';

-- Show settings
SELECT * FROM duckdb_settings();
```

## React/WASM Quick Reference

### Initialization

```typescript
import * as duckdb from '@duckdb/duckdb-wasm';

const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
const worker = new Worker(
  URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`])
  )
);
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();
```

### Queries

```typescript
// Execute
const result = await conn.query("SELECT * FROM t");

// Prepared statement
const stmt = await conn.prepare("SELECT * FROM t WHERE id = ?");
const r1 = await stmt.query(1);
const r2 = await stmt.query(2);
await stmt.close();

// Results
const rows = result.toArray();
const schema = result.schema;
for (const row of result) {
  console.log(row.col);
}
```

### Files

```typescript
// Register files
await db.registerFileText('data.json', JSON.stringify(data));
await db.registerFileBuffer('data.parquet', uint8Array);

// From user upload
const buffer = await file.arrayBuffer();
await db.registerFileBuffer(file.name, new Uint8Array(buffer));

// Cleanup
await db.dropFile('data.parquet');
await db.dropFiles();
```

### React Hook Pattern

```typescript
function useDuckDB() {
  const [state, setState] = useState({ db: null, conn: null, isLoading: true });
  
  useEffect(() => {
    initDuckDB().then(({ db, conn }) => {
      setState({ db, conn, isLoading: false });
    });
    return () => {
      state.conn?.close();
      state.db?.terminate();
    };
  }, []);
  
  return state;
}
```

## Common SQL Patterns

### Time Series

```sql
-- Daily aggregation
SELECT 
  DATE_TRUNC('day', timestamp) as day,
  COUNT(*) as events,
  AVG(value) as avg_value
FROM events
GROUP BY 1
ORDER BY 1;

-- Time bucketing with gaps filled
WITH hours AS (
  SELECT generate_series(
    MIN(DATE_TRUNC('hour', timestamp)),
    MAX(DATE_TRUNC('hour', timestamp)),
    INTERVAL '1 hour'
  ) as hour
  FROM events
)
SELECT 
  h.hour,
  COUNT(e.id) as events
FROM hours h
LEFT JOIN events e ON DATE_TRUNC('hour', e.timestamp) = h.hour
GROUP BY 1
ORDER BY 1;

-- Running total
SELECT
  timestamp,
  value,
  SUM(value) OVER (ORDER BY timestamp) as running_total
FROM events;
```

### Deduplication

```sql
-- Keep latest per group
SELECT *
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn
  FROM events
)
WHERE rn = 1;

-- Exact duplicates
SELECT DISTINCT * FROM t;

-- Delete duplicates (keep one)
DELETE FROM t
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM t
  GROUP BY col1, col2, col3
);
```

### Pivot/Unpivot

```sql
-- Pivot
PIVOT events
ON event_type
USING COUNT(*)
GROUP BY DATE(timestamp);

-- Unpivot
UNPIVOT measurements
ON col1, col2, col3
INTO
  NAME metric
  VALUE value;
```

### String Aggregation

```sql
-- Group concat
SELECT 
  category,
  STRING_AGG(name, ', ') as names,
  STRING_AGG(name, ', ' ORDER BY name) as sorted_names
FROM items
GROUP BY category;
```

## Performance Tips

1. **Use Parquet** - 10-100x faster than CSV for analytics
2. **Filter early** - Push filters to source
3. **Limit before fetch** - Use LIMIT in SQL, not after
4. **Batch inserts** - Insert in chunks, not row-by-row
5. **Disable insertion order** - `SET preserve_insertion_order = false`
6. **Use Arrow** - For large data, avoid pandas overhead
7. **Create indexes** - On join/filter columns for large tables
8. **Partition writes** - For large exports to multiple files
