# DuckDB Python API Overview

Core patterns for using DuckDB in Python applications.

## Installation

```bash
# Core package
pip install duckdb

# With data science stack
pip install duckdb pandas pyarrow polars
```

## Connections

### Connection Types

```python
import duckdb

# In-memory database (fastest, no persistence)
conn = duckdb.connect()

# File-backed database (persists to disk)
conn = duckdb.connect("analytics.db")

# Read-only mode (safer for production queries)
conn = duckdb.connect("analytics.db", read_only=True)

# Context manager (auto-close)
with duckdb.connect("analytics.db") as conn:
    result = conn.execute("SELECT 1").fetchone()
```

### Connection Pooling Pattern

```python
from contextlib import contextmanager
import threading

# Thread-local connections (NOT thread-safe to share)
_local = threading.local()

def get_connection():
    if not hasattr(_local, 'conn'):
        _local.conn = duckdb.connect("analytics.db")
    return _local.conn

@contextmanager
def db_connection():
    conn = get_connection()
    try:
        yield conn
    finally:
        # Don't close - reuse across requests
        pass
```

## Basic Query Execution

### Fetch Methods

```python
conn = duckdb.connect()

# Single value
result = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]

# All rows as tuples
rows = conn.execute("SELECT * FROM events").fetchall()

# Pandas DataFrame (copies data)
df = conn.execute("SELECT * FROM events").fetchdf()

# Polars DataFrame
df = conn.execute("SELECT * FROM events").fetch_pl()

# Apache Arrow (zero-copy for Arrow-compatible tools)
arrow_table = conn.execute("SELECT * FROM events").fetch_arrow_table()

# NumPy arrays (for numeric data)
arr = conn.execute("SELECT value FROM events").fetchnumpy()
```

### Executing from Files

```python
# Execute SQL from file
with open("query.sql") as f:
    conn.execute(f.read())

# Execute multiple statements
conn.executemany("INSERT INTO t VALUES (?)", [(1,), (2,), (3,)])
```

## Working with Python Data

### Pandas Integration

```python
import pandas as pd

# DataFrame to DuckDB table
conn.execute("CREATE TABLE events AS SELECT * FROM df")

# Or register as view (no data copy)
conn.register("events_view", df)

# Query the view
result = conn.execute("SELECT * FROM events_view WHERE value > 100").fetchdf()

# DuckDB to DataFrame
df = conn.execute("SELECT * FROM events").fetchdf()
```

### Polars Integration

```python
import polars as pl

# Polars to DuckDB
conn.execute("CREATE TABLE events AS SELECT * FROM pl_df")

# DuckDB to Polars
pl_df = conn.execute("SELECT * FROM events").fetch_pl()
```

### Arrow Integration

```python
import pyarrow as pa

# Arrow to DuckDB
conn.execute("CREATE TABLE events AS SELECT * FROM arrow_table")

# Arrow RecordBatches (streaming)
for batch in conn.execute("SELECT * FROM big_table").fetch_arrow_reader():
    process_batch(batch)
```

### Python Iterables

```python
# Insert from generator
def data_generator():
    for i in range(1000000):
        yield (i, f"item_{i}")

conn.executemany("INSERT INTO items VALUES (?, ?)", data_generator())
```

## SQL Features

### Data Types

DuckDB supports rich data types:

```sql
-- Basic types
INTEGER, BIGINT, SMALLINT
FLOAT, DOUBLE, DECIMAL(10,2)
VARCHAR, BLOB
DATE, TIME, TIMESTAMP, INTERVAL

-- Nested types
INTEGER[], VARCHAR[]              -- Arrays
MAP(VARCHAR, INTEGER)             -- Maps
STRUCT(field1 INTEGER, field2 VARCHAR)  -- Structs
UNION(tag1 INTEGER, tag2 VARCHAR)  -- Unions

-- Special types
UUID, JSON, BIT
```

### DDL Operations

```python
# Create table
conn.execute("""
    CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        event_type VARCHAR NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        payload JSON,
        tags VARCHAR[]
    )
""")

# Create from query
conn.execute("""
    CREATE TABLE daily_stats AS
    SELECT 
        DATE(timestamp) as day,
        COUNT(*) as event_count,
        AVG(value) as avg_value
    FROM events
    GROUP BY 1
""")

# Temporary tables (session-scoped)
conn.execute("""
    CREATE TEMP TABLE temp_results AS
    SELECT * FROM events WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
""")

# Views
conn.execute("""
    CREATE VIEW recent_events AS
    SELECT * FROM events WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'
""")

# Indexes (use sparingly, mainly for primary/join keys)
conn.execute("CREATE INDEX idx_event_type ON events(event_type)")
conn.execute("CREATE UNIQUE INDEX idx_id ON events(id)")
```

### DML Operations

```python
# INSERT
conn.execute("INSERT INTO events VALUES (1, 'click', '2024-01-15', '{\"page\": \"/home\"}', ['web'])")

# INSERT from SELECT
conn.execute("""
    INSERT INTO archive
    SELECT * FROM events 
    WHERE timestamp < CURRENT_DATE - INTERVAL '30 days'
""")

# UPDATE
conn.execute("UPDATE events SET event_type = 'pageview' WHERE event_type = 'view'")

# DELETE
conn.execute("DELETE FROM events WHERE timestamp < CURRENT_DATE - INTERVAL '90 days'")

# MERGE (UPSERT)
conn.execute("""
    MERGE INTO target_table AS target
    USING source_table AS source
    ON target.id = source.id
    WHEN MATCHED THEN UPDATE SET target.value = source.value
    WHEN NOT MATCHED THEN INSERT (id, value) VALUES (source.id, source.value)
""")
```

## Querying File Formats

### CSV Files

```python
# Direct query
df = conn.execute("SELECT * FROM 'data.csv' LIMIT 100").fetchdf()

# With options
df = conn.execute("""
    SELECT * FROM read_csv_auto('data.csv',
        header=true,
        delimiter=',',
        quote='"',
        escape='"',
        nullstr='NULL',
        ignore_errors=true,
        columns={'id': 'INTEGER', 'name': 'VARCHAR'}
    )
""").fetchdf()

# Copy from CSV
conn.execute("""
    COPY (SELECT * FROM 's3://bucket/data.csv')
    TO 'local_data.csv' (HEADER, DELIMITER ',')
""")
```

### Parquet Files

```python
# Read parquet
df = conn.execute("SELECT * FROM 'data.parquet'").fetchdf()

# Read partitioned parquet
df = conn.execute("""
    SELECT * FROM read_parquet('data/**/*.parquet', hive_partitioning=1)
""").fetchdf()

# Write parquet
conn.execute("""
    COPY (SELECT * FROM events) 
    TO 'events.parquet' 
    (FORMAT PARQUET, COMPRESSION 'ZSTD')
""")

# Multiple files
conn.execute("""
    COPY (SELECT * FROM events)
    TO 'output/' 
    (FORMAT PARQUET, 
     PARTITION_BY (year, month),
     OVERWRITE_OR_IGNORE)
""")
```

### JSON Files

```python
# Read JSON lines
conn.execute("""
    CREATE TABLE events AS
    SELECT * FROM read_json_auto('events.jsonl')
""")

# Read nested JSON
conn.execute("""
    SELECT 
        user->>'id' as user_id,
        user->>'name' as user_name,
        data->>'action' as action
    FROM read_json_auto('nested.json')
""")

# Extract array elements
conn.execute("""
    SELECT unnest(items) as item
    FROM read_json_auto('orders.json')
""")
```

## Configuration

### Memory & Threads

```python
# Set memory limit
conn.execute("SET memory_limit = '4GB'")

# Set threads (default = CPU cores)
conn.execute("SET threads = 8")

# Preserve insertion order (disable for better parallelism)
conn.execute("SET preserve_insertion_order = false")

# Progress bar for long queries
conn.execute("SET enable_progress_bar = true")
```

### Query Behavior

```python
# Explain query plan
conn.execute("EXPLAIN ANALYZE SELECT * FROM large_table WHERE x > 100").fetchall()

# Enable profiling
conn.execute("SET enable_profiling = 'json'")
conn.execute("SET profiling_output = 'profile.json'")

# Enable logging
conn.execute("SET log_query_path = 'queries.log'")
```

## Best Practices

### 1. Always Use Parameterized Queries

```python
# BAD - SQL injection risk
user_id = "1; DROP TABLE users; --"
conn.execute(f"SELECT * FROM users WHERE id = {user_id}")

# GOOD - Parameterized
conn.execute("SELECT * FROM users WHERE id = ?", [user_id])

# Multiple parameters
conn.execute("SELECT * FROM events WHERE type = ? AND date > ?", [event_type, date])
```

### 2. Handle Large Results Appropriately

```python
# For very large results, stream instead of fetching all
import pyarrow as pa

reader = conn.execute("SELECT * FROM billion_row_table").fetch_arrow_reader()
for batch in reader:
    process_batch(batch)  # Process 10K rows at a time

# Or use the relational API for lazy evaluation
rel = conn.table("big_table").filter("value > 100").project("id, value")
rel.to_arrow_table()  # Only now executes
```

### 3. Transaction Management

```python
# Explicit transactions
conn.execute("BEGIN TRANSACTION")
try:
    conn.execute("INSERT INTO accounts VALUES (1, 100)")
    conn.execute("INSERT INTO accounts VALUES (2, 200)")
    conn.execute("COMMIT")
except:
    conn.execute("ROLLBACK")
    raise
```

### 4. Connection Lifecycle

```python
# For web servers: connection per request
from flask import Flask
import duckdb

app = Flask(__name__)

@app.route("/query")
def query():
    with duckdb.connect("analytics.db") as conn:
        result = conn.execute("SELECT * FROM events LIMIT 100").fetchdf()
        return result.to_json()

# For data pipelines: long-lived connection with reconnect
class DuckDBPipeline:
    def __init__(self, db_path):
        self.db_path = db_path
        self._conn = None
    
    @property
    def conn(self):
        if self._conn is None:
            self._conn = duckdb.connect(self.db_path)
        return self._conn
    
    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None
```

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `RuntimeError: TransactionContext Error` | Concurrent access | Use one connection per thread |
| `Out of Memory` | Large result sets | Use fetch_arrow_reader() or LIMIT |
| `Permission denied` | Read-only file | Check file permissions or use :memory: |
| `Binder Error: Table not found` | Schema mismatch | Use fully qualified names |
| `Invalid Input Error: Malformed JSON` | JSON parsing | Use read_json_auto with ignore_errors=true |

## Useful SQL Patterns

### Window Functions

```python
conn.execute("""
    SELECT
        user_id,
        timestamp,
        value,
        SUM(value) OVER (PARTITION BY user_id ORDER BY timestamp) as running_total,
        AVG(value) OVER (PARTITION BY user_id ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn
    FROM events
""").fetchdf()
```

### Time Series Analysis

```python
# Time bucketing
conn.execute("""
    SELECT
        time_bucket(INTERVAL '1 hour', timestamp) as hour,
        COUNT(*) as events,
        AVG(value) as avg_value
    FROM events
    GROUP BY 1
    ORDER BY 1
""").fetchdf()

# Gap filling with generate_series
conn.execute("""
    SELECT 
        gs as hour,
        COALESCE(t.events, 0) as events
    FROM generate_series(
        '2024-01-01'::TIMESTAMP, 
        '2024-01-31'::TIMESTAMP, 
        INTERVAL '1 hour'
    ) gs
    LEFT JOIN (
        SELECT time_bucket(INTERVAL '1 hour', timestamp) as hour, COUNT(*) as events
        FROM events
        GROUP BY 1
    ) t ON gs = t.hour
""")
```

### Pivot/Unpivot

```python
# Pivot
conn.execute("""
    PIVOT events
    ON event_type
    USING COUNT(*)
    GROUP BY DATE(timestamp)
""")

# Unpivot
conn.execute("""
    UNPIVOT measurements
    ON col1, col2, col3
    INTO
        NAME attribute
        VALUE value
""")
```
