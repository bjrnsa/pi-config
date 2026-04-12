# DuckDB Data Ingestion

Loading data from various sources into DuckDB.

## CSV Files

### Reading CSV

```python
# Simple read
df = conn.execute("SELECT * FROM 'data.csv'").fetchdf()

# With automatic type detection
df = conn.execute("""
    SELECT * FROM read_csv_auto('data.csv')
""").fetchdf()

# With explicit options
df = conn.execute("""
    SELECT * FROM read_csv('data.csv',
        header = true,
        delimiter = ',',
        quote = '"',
        escape = '"',
        nullstr = 'NULL',
        ignore_errors = true,
        sample_size = 100000,
        all_varchar = false,
        normalize_names = true
    )
""").fetchdf()
```

### CSV Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `header` | First row is header | `true` |
| `delimiter` | Column separator | `,` |
| `quote` | Quote character | `"` |
| `escape` | Escape character | `"` |
| `nullstr` | String representing NULL | Empty string |
| `ignore_errors` | Skip malformed rows | `false` |
| `sample_size` | Rows for type detection | 20480 |
| `all_varchar` | Read all as VARCHAR | `false` |
| `normalize_names` | Lowercase, replace spaces | `false` |
| `dateformat` | Date format string | ISO8601 |
| `timestampformat` | Timestamp format string | ISO8601 |
| `columns` | Dict of column types | Auto-detect |

### Writing CSV

```python
# Simple export
conn.execute("COPY events TO 'events.csv' (HEADER)")

# With options
conn.execute("""
    COPY (SELECT * FROM events WHERE date > '2024-01-01')
    TO 'recent_events.csv' (
        HEADER,
        DELIMITER '|',
        QUOTE '"',
        ESCAPE '"',
        NULL 'NULL',
        COMPRESSION 'gzip'
    )
""")

# Multiple files
conn.execute("""
    COPY (SELECT * FROM events)
    TO 'output/events.csv'
    WITH (
        FORMAT CSV,
        PARTITION_BY (year, month),
        PER_THREAD_OUTPUT true
    )
""")
```

## Parquet Files

### Reading Parquet

```python
# Single file
df = conn.execute("SELECT * FROM 'data.parquet'").fetchdf()

# Directory of files
df = conn.execute("SELECT * FROM 'data/*.parquet'").fetchdf()

# Recursive glob
df = conn.execute("SELECT * FROM 'data/**/*.parquet'").fetchdf()

# With hive partitioning
conn.execute("""
    SELECT * FROM read_parquet('data/**/*.parquet',
        hive_partitioning = true,
        filename = true
    )
""")

# Union by name (for different schemas)
conn.execute("""
    SELECT * FROM read_parquet('data/*.parquet', union_by_name = true)
""")
```

### Parquet Pushdown Features

```python
# Row group pruning (automatic with filters)
df = conn.execute("""
    SELECT * FROM 'large.parquet'
    WHERE timestamp > '2024-01-01'
    -- Only reads relevant row groups
""").fetchdf()

# Column projection (automatic with SELECT)
df = conn.execute("""
    SELECT user_id, value FROM 'large.parquet'
    -- Only reads specified columns
""").fetchdf()
```

### Writing Parquet

```python
# Simple export
conn.execute("COPY events TO 'events.parquet' (FORMAT PARQUET)")

# With compression and row group size
conn.execute("""
    COPY events
    TO 'events.parquet' (
        FORMAT PARQUET,
        COMPRESSION 'ZSTD',  -- SNAPPY, GZIP, ZSTD, NONE
        ROW_GROUP_SIZE 100000,
        ROW_GROUPS_PER_FILE 1
    )
""")

# Partitioned output
conn.execute("""
    COPY (SELECT * FROM events)
    TO 'output/' (
        FORMAT PARQUET,
        PARTITION_BY (year, month, day),
        OVERWRITE_OR_IGNORE,
        FILENAME_PATTERN 'events_{uuid}'
    )
""")

# Per-thread output (faster for large exports)
conn.execute("""
    COPY (SELECT * FROM events)
    TO 'output/' (
        FORMAT PARQUET,
        PER_THREAD_OUTPUT true,
        FILE_SIZE_BYTES '100MB'
    )
""")
```

## JSON Files

### Reading JSON

```python
# JSON Lines (one object per line)
df = conn.execute("SELECT * FROM 'data.jsonl'").fetchdf()

# Array of objects
df = conn.execute("""
    SELECT * FROM read_json_auto('data.json',
        format = 'array'
    )
""").fetchdf()

# Newline-delimited JSON (ndjson)
df = conn.execute("""
    SELECT * FROM read_json_auto('data.ndjson',
        format = 'newline_delimited'
    )
""").fetchdf()
```

### JSON Options

```python
df = conn.execute("""
    SELECT * FROM read_json('data.json',
        auto_detect = true,
        format = 'auto',  -- 'auto', 'unstructured', 'newline_delimited', 'array'
        dateformat = '%Y-%m-%d',
        timestampformat = '%Y-%m-%d %H:%M:%S',
        maximum_object_size = 16777216,
        maximum_depth = 1000,
        records = true,
        field_appearance_threshold = 0.0,
        map_inference_threshold = 25,
        sample_size = 20480
    )
""").fetchdf()
```

### Nested JSON Handling

```python
# Extract nested fields
df = conn.execute("""
    SELECT
        id,
        user->>'id' as user_id,
        user->>'name' as user_name,
        data->>'action' as action,
        data->>'page' as page,
        metadata->>'source' as source
    FROM read_json_auto('events.json')
""").fetchdf()

# Extract arrays
conn.execute("""
    CREATE TABLE orders AS
    SELECT 
        id,
        customer_id,
        order_date,
        UNNEST(items) as item
    FROM read_json_auto('orders.json')
""")

# Flatten nested arrays
conn.execute("""
    SELECT 
        o.id,
        o.customer_id,
        item->>'sku' as sku,
        item->>'quantity' as quantity,
        item->>'price' as price
    FROM read_json_auto('orders.json') o,
    UNNEST(o.items) as item
""")
```

### Writing JSON

```python
# JSON Lines (default)
conn.execute("COPY events TO 'events.json'")

# Array format
conn.execute("COPY events TO 'events.json' (ARRAY)")

# With options
conn.execute("""
    COPY (SELECT * FROM events)
    TO 'events.json' (
        FORMAT JSON,
        ARRAY,
        COMPRESSION 'gzip'
    )
""")
```

## Direct Database Integration

### PostgreSQL

```python
# Install and load extension
conn.execute("INSTALL postgres;")
conn.execute("LOAD postgres;")

# Attach database
conn.execute("""
    ATTACH 'dbname=mydb user=postgres password=secret host=localhost' 
    AS pg_db (TYPE postgres)
""")

# Query PostgreSQL tables
df = conn.execute("SELECT * FROM pg_db.public.users").fetchdf()

# Copy data to DuckDB
conn.execute("""
    CREATE TABLE local_users AS
    SELECT * FROM pg_db.public.users
""")
```

### MySQL

```python
conn.execute("INSTALL mysql;")
conn.execute("LOAD mysql;")

conn.execute("""
    ATTACH 'host=localhost user=root password=secret database=mydb' 
    AS mysql_db (TYPE mysql)
""")

df = conn.execute("SELECT * FROM mysql_db.users").fetchdf()
```

### SQLite

```python
# SQLite is built-in
conn.execute("ATTACH 'sqlite.db' AS sqlite_db")
df = conn.execute("SELECT * FROM sqlite_db.users").fetchdf()

# Copy schema and data
conn.execute("""
    CREATE TABLE users AS
    SELECT * FROM sqlite_db.users
""")
```

## Cloud Storage

### S3 Configuration

```python
# Install httpfs extension
conn.execute("INSTALL httpfs;")
conn.execute("LOAD httpfs;")

# Configure credentials
conn.execute("SET s3_region='us-east-1'")
conn.execute("SET s3_access_key_id='YOUR_KEY'")
conn.execute("SET s3_secret_access_key='YOUR_SECRET'")

# Or use environment variables
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION

# Query S3 files
df = conn.execute("SELECT * FROM 's3://bucket/data.parquet'").fetchdf()

# With path filtering
df = conn.execute("""
    SELECT * FROM 's3://bucket/2024/**/*.parquet'
""").fetchdf()

# Write to S3
conn.execute("""
    COPY (SELECT * FROM events)
    TO 's3://bucket/output/events.parquet'
    (FORMAT PARQUET)
""")
```

### S3 with Requester Pays

```python
conn.execute("SET s3_requester_pays=true")
```

### GCS (Google Cloud Storage)

```python
conn.execute("INSTALL httpfs;")
conn.execute("LOAD httpfs;")

# Using service account key
conn.execute("SET gcs_account_json='path/to/key.json'")

# Or HMAC keys
conn.execute("SET gcs_access_key_id='...'")
conn.execute("SET gcs_secret_access_key='...'")

# Query GCS
df = conn.execute("SELECT * FROM 'gcs://bucket/data.parquet'").fetchdf()
```

### Azure Blob Storage

```python
conn.execute("INSTALL azure;")
conn.execute("LOAD azure;")

# Connection string
conn.execute("""
    CREATE SECRET azure_secret (
        TYPE AZURE,
        CONNECTION_STRING 'DefaultEndpointsProtocol=https;AccountName=...'
    )
""")

# Query Azure
df = conn.execute("SELECT * FROM 'azure://container/data.parquet'").fetchdf()
```

## HTTP/HTTPS Files

```python
# Direct HTTP read (requires httpfs)
conn.execute("INSTALL httpfs;")
conn.execute("LOAD httpfs;")

# Read from URL
df = conn.execute("""
    SELECT * FROM 'https://example.com/data.csv'
""").fetchdf()

# Read parquet from URL
df = conn.execute("""
    SELECT * FROM 'https://example.com/data.parquet'
""").fetchdf()

# With authentication
conn.execute("CREATE SECRET http_secret (TYPE HTTP, HTTP_HEADER 'Authorization: Bearer token')")
```

## Python Data Sources

### Pandas DataFrames

```python
import pandas as pd

# DataFrame to table
df = pd.DataFrame({
    'id': [1, 2, 3],
    'name': ['Alice', 'Bob', 'Charlie'],
    'value': [100.5, 200.5, 300.5]
})

# Create table from DataFrame
conn.execute("CREATE TABLE users AS SELECT * FROM df")

# Or register as view (no copy)
conn.register("users_view", df)
conn.execute("SELECT * FROM users_view WHERE value > 150")

# Arrow-backed DataFrames (zero-copy)
df_arrow = pd.DataFrame({...}).convert_dtypes(dtype_backend='pyarrow')
conn.register("arrow_view", df_arrow)
```

### Polars DataFrames

```python
import polars as pl

# Polars to DuckDB
df = pl.DataFrame({
    'id': [1, 2, 3],
    'value': [100, 200, 300]
})

conn.execute("CREATE TABLE data AS SELECT * FROM df")

# Polars lazy to DuckDB (executes the plan)
lazy_df = pl.scan_parquet('data.parquet')
conn.execute("CREATE TABLE data AS SELECT * FROM lazy_df")
```

### Apache Arrow

```python
import pyarrow as pa

# Arrow Table to DuckDB
table = pa.table({
    'id': [1, 2, 3],
    'value': [100.0, 200.0, 300.0]
})

conn.execute("CREATE TABLE data AS SELECT * FROM table")

# Arrow Dataset to DuckDB (lazy, partitioned)
import pyarrow.dataset as ds
dataset = ds.dataset('data/', format='parquet')
conn.execute("CREATE TABLE data AS SELECT * FROM dataset")

# Streaming from Arrow reader
reader = conn.execute("SELECT * FROM big_table").fetch_arrow_reader()
for batch in reader:
    process_batch(batch)
```

### NumPy Arrays

```python
import numpy as np

# Arrays to DuckDB
arr = np.array([1, 2, 3, 4, 5])
conn.execute("CREATE TABLE numbers AS SELECT * FROM arr")

# 2D arrays become tables
arr_2d = np.array([[1, 2], [3, 4], [5, 6]])
conn.execute("CREATE TABLE matrix AS SELECT * FROM arr_2d")
```

## Streaming and Chunked Loading

### Chunked CSV Reading

```python
# For very large CSVs, use COPY with chunking
conn.execute("""
    CREATE TABLE events AS
    SELECT * FROM read_csv_auto('huge.csv')
    LIMIT 1000000  -- Process in chunks
""")

# Or use Python streaming
import pandas as pd

chunk_size = 100000
for i, chunk in enumerate(pd.read_csv('huge.csv', chunksize=chunk_size)):
    conn.register(f"chunk_{i}", chunk)
    conn.execute(f"INSERT INTO events SELECT * FROM chunk_{i}")
    print(f"Processed chunk {i}")
```

### Streaming Arrow

```python
# Arrow IPC streaming
import pyarrow as pa

# Write Arrow IPC file
with pa.ipc.new_file('data.arrow', schema=table.schema) as writer:
    for batch in table.to_batches(max_chunksize=10000):
        writer.write_batch(batch)

# Read in DuckDB
df = conn.execute("SELECT * FROM 'data.arrow'").fetchdf()
```

## Performance Best Practices

### 1. Use Parquet for Large Data

```python
# CSV is slow for large data
# Convert once, query many times
conn.execute("""
    COPY (SELECT * FROM 'data.csv')
    TO 'data.parquet' (FORMAT PARQUET, COMPRESSION 'ZSTD')
""")

# Now queries are 10-100x faster
```

### 2. Enable Parallel CSV Reading

```python
conn.execute("SET preserve_insertion_order = false")
df = conn.execute("SELECT * FROM 'data.csv'").fetchdf()
```

### 3. Use Appropriate Types

```python
# Don't let all_varchar=true unless needed
# Explicit types are faster
df = conn.execute("""
    SELECT * FROM read_csv('data.csv', columns={
        'id': 'INTEGER',
        'timestamp': 'TIMESTAMP',
        'value': 'DOUBLE',
        'category': 'VARCHAR'
    })
""").fetchdf()
```

### 4. Filter Early

```python
# Good: Filter at read time
conn.execute("""
    CREATE TABLE recent AS
    SELECT * FROM read_parquet('data/*.parquet')
    WHERE date > '2024-01-01'
""")

# Bad: Load all, then filter
conn.execute("""
    CREATE TABLE all_data AS
    SELECT * FROM read_parquet('data/*.parquet')
""")
conn.execute("CREATE TABLE recent AS SELECT * FROM all_data WHERE date > '2024-01-01'")
```

### 5. Batch Inserts

```python
# Good: Batch insert
import pandas as pd

def batch_insert(conn, csv_file, table_name, batch_size=100000):
    for i, chunk in enumerate(pd.read_csv(csv_file, chunksize=batch_size)):
        conn.register("chunk", chunk)
        if i == 0:
            conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM chunk")
        else:
            conn.execute(f"INSERT INTO {table_name} SELECT * FROM chunk")
        conn.unregister("chunk")

# Bad: Row-by-row insertion
for row in data:
    conn.execute(f"INSERT INTO table VALUES ({row[0]}, '{row[1]}')")
```

## Data Type Conversion Reference

| Source | DuckDB Type | Notes |
|--------|-------------|-------|
| CSV Integer | INTEGER, BIGINT | Auto-detected |
| CSV Float | DOUBLE | Auto-detected |
| CSV Date | DATE | Use dateformat= |
| CSV Timestamp | TIMESTAMP | Use timestampformat= |
| Parquet int32 | INTEGER | Direct mapping |
| Parquet int64 | BIGINT | Direct mapping |
| Parquet float | FLOAT | Direct mapping |
| Parquet double | DOUBLE | Direct mapping |
| JSON number | DOUBLE | May need cast |
| JSON string | VARCHAR | May need cast |
| JSON boolean | BOOLEAN | Direct mapping |
| Pandas int64 | BIGINT | Direct mapping |
| Pandas float64 | DOUBLE | Direct mapping |
| Pandas datetime64[ns] | TIMESTAMP | Nanoseconds |
| Pandas string | VARCHAR | Or JSON |
| Arrow int64 | BIGINT | Direct mapping |
| Arrow timestamp | TIMESTAMP | Microseconds |
| Arrow string | VARCHAR | Direct mapping |
| Arrow dictionary | ENUM | Or VARCHAR |
