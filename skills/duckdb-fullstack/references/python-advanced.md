# DuckDB Advanced Python Patterns

Threading, UDFs, extensions, and production patterns.

## Thread Safety and Concurrency

### Connection Per Thread

**Critical:** DuckDB connections are NOT thread-safe. Each thread needs its own connection.

```python
import threading
import duckdb

# Thread-local storage for connections
_thread_locals = threading.local()

def get_connection():
    """Get or create thread-local connection."""
    if not hasattr(_thread_locals, 'conn'):
        _thread_locals.conn = duckdb.connect("analytics.db")
    return _thread_locals.conn

def worker_function(data_chunk):
    """Worker that uses thread-local connection."""
    conn = get_connection()
    conn.register("chunk", data_chunk)
    conn.execute("INSERT INTO results SELECT * FROM chunk")

# Process data in parallel threads
threads = []
for chunk in data_chunks:
    t = threading.Thread(target=worker_function, args=(chunk,))
    threads.append(t)
    t.start()

for t in threads:
    t.join()
```

### Process Pool Pattern

```python
from concurrent.futures import ProcessPoolExecutor
import duckdb

def process_partition(partition_id: int):
    """Process a partition in a separate process."""
    conn = duckdb.connect(f"partition_{partition_id}.db")
    
    # Process data
    conn.execute(f"""
        CREATE TABLE results AS
        SELECT * FROM read_parquet('input/part_{partition_id}.parquet')
        WHERE value > 100
    """)
    
    return f"partition_{partition_id}.db"

# Process in parallel
with ProcessPoolExecutor(max_workers=4) as executor:
    db_files = list(executor.map(process_partition, range(4)))

# Merge results
main_conn = duckdb.connect("final.db")
for db_file in db_files:
    main_conn.execute(f"ATTACH '{db_file}' AS partition")
    main_conn.execute("INSERT INTO final_results SELECT * FROM partition.results")
    main_conn.execute(f"DETACH partition")
```

### Read-Only Concurrent Access

```python
# Multiple threads can read from the same database file
# Each thread needs its own connection

import threading

def reader_thread(query: str):
    conn = duckdb.connect("analytics.db", read_only=True)
    result = conn.execute(query).fetchdf()
    return result

# Spawn readers
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = [
        executor.submit(reader_thread, "SELECT * FROM events LIMIT 1000")
        for _ in range(8)
    ]
    results = [f.result() for f in futures]
```

## User-Defined Functions (UDFs)

### Python UDFs

```python
import duckdb

conn = duckdb.connect()

# Simple scalar UDF
conn.create_function(
    "add_one", 
    lambda x: x + 1, 
    return_type=duckdb.typing.INTEGER,
    parameters=[duckdb.typing.INTEGER]
)

# Use in SQL
result = conn.execute("SELECT add_one(value) FROM (VALUES (1), (2), (3)) t(value)").fetchall()
# [(2,), (3,), (4,)]

# String UDF
conn.create_function(
    "slugify",
    lambda s: s.lower().replace(" ", "-").replace("_", "-"),
    return_type=duckdb.typing.VARCHAR,
    parameters=[duckdb.typing.VARCHAR]
)

result = conn.execute("SELECT slugify('Hello World')").fetchone()[0]
# 'hello-world'
```

### UDF with Multiple Parameters

```python
from typing import Optional
import re

def extract_domain(url: str) -> Optional[str]:
    """Extract domain from URL."""
    if not url:
        return None
    match = re.search(r'https?://([^/]+)', url)
    return match.group(1) if match else None

conn.create_function(
    "extract_domain",
    extract_domain,
    return_type=duckdb.typing.VARCHAR,
    parameters=[duckdb.typing.VARCHAR]
)

# Use in query
df = conn.execute("""
    SELECT 
        url,
        extract_domain(url) as domain
    FROM events
""").fetchdf()
```

### Aggregate UDFs

```python
import statistics

# Define aggregate state and functions
class StatsAggregate:
    def __init__(self):
        self.values = []
    
    def step(self, value):
        if value is not None:
            self.values.append(value)
    
    def finalize(self):
        if not self.values:
            return None
        return {
            'mean': statistics.mean(self.values),
            'median': statistics.median(self.values),
            'stdev': statistics.stdev(self.values) if len(self.values) > 1 else 0
        }

# Register as aggregate (complex return type requires workaround)
conn.create_function(
    "stats_agg",
    lambda x: x,  # Identity function for finalization
    return_type=duckdb.typing.DOUBLE,
    parameters=[duckdb.typing.DOUBLE]
)

# For complex aggregates, use Python aggregation on groups
# This is more reliable than SQL aggregates with complex types
```

### Arrow UDFs (Vectorized)

```python
import pyarrow as pa
import numpy as np

# Arrow UDFs operate on batches (much faster)
def normalize_values(values: pa.Array) -> pa.Array:
    """Normalize values to 0-1 range."""
    arr = values.to_numpy()
    min_val = np.min(arr)
    max_val = np.max(arr)
    if max_val == min_val:
        return pa.array(np.zeros_like(arr))
    normalized = (arr - min_val) / (max_val - min_val)
    return pa.array(normalized)

conn.create_function(
    "normalize",
    normalize_values,
    return_type=duckdb.typing.DOUBLE,
    parameters=[duckdb.typing.DOUBLE],
    type="arrow"
)

# Use in query
df = conn.execute("""
    SELECT 
        category,
        normalize(value) as normalized_value
    FROM events
""").fetchdf()
```

## Extensions

### Installing and Loading

```python
# List available extensions
conn.execute("SELECT * FROM duckdb_extensions()").fetchdf()

# Install extension
conn.execute("INSTALL httpfs;")

# Load extension
conn.execute("LOAD httpfs;")

# Install from URL (specific version)
conn.execute("INSTALL spatial FROM 'https://extensions.duckdb.org';")

# Force reinstall
conn.execute("INSTALL httpfs FORCE INSTALL;")
```

### Essential Extensions

#### HTTPFS (S3, GCS, HTTPS)

```python
conn.execute("LOAD httpfs;")

# S3 configuration
conn.execute("SET s3_region='us-east-1'")
conn.execute("SET s3_access_key_id='...'")
conn.execute("SET s3_secret_access_key='...'")

# Query S3
conn.execute("SELECT * FROM 's3://bucket/data.parquet'").fetchdf()

# HTTPS
conn.execute("SELECT * FROM 'https://example.com/data.csv'").fetchdf()
```

#### JSON Extension

```python
# Built-in since DuckDB 0.10+
# JSON functions
conn.execute("""
    SELECT 
        json_object('name', name, 'value', value),
        json_array(name, value),
        json_extract('{"a": {"b": 1}}', '$.a.b')
""")

# Table functions
conn.execute("SELECT * FROM read_json_auto('data.jsonl')")
```

#### Spatial Extension

```python
conn.execute("INSTALL spatial;")
conn.execute("LOAD spatial;")

# Geometry functions
conn.execute("""
    SELECT 
        ST_Point(longitude, latitude) as geom,
        ST_Distance(ST_Point(0, 0), ST_Point(1, 1)) as distance,
        ST_Within(ST_Point(0.5, 0.5), ST_GeomFromText('POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))')) as inside
    FROM locations
""")

# Spatial joins
conn.execute("""
    SELECT 
        a.id,
        b.id as nearest_neighbor
    FROM points a
    JOIN points b
    ON ST_DWithin(a.geom, b.geom, 1000)
    WHERE a.id != b.id
""")
```

#### Full-Text Search (FTS)

```python
conn.execute("INSTALL fts;")
conn.execute("LOAD fts;")

# Create FTS index
conn.execute("""
    PRAGMA create_fts_index(
        'documents',
        'doc_id',
        'title',
        'content'
    )
""")

# Search
conn.execute("""
    SELECT * FROM match_documents('database systems')
""").fetchdf()
```

#### ICU (International Components for Unicode)

```python
conn.execute("LOAD icu;")

# Locale-aware collation
conn.execute("SELECT * FROM names ORDER BY name COLLATE 'de_DE'")

# Date/time formatting
conn.execute("SELECT strftime('%A, %d. %B %Y', CURRENT_TIMESTAMP, 'de_DE')")
```

#### Parquet Extension

```python
# Built-in
# Advanced Parquet features
conn.execute("""
    SELECT * FROM read_parquet('data.parquet',
        hive_partitioning = true,
        filename = true,
        file_row_number = true
    )
""")
```

### Custom Extensions

```python
# Load community extension
conn.execute("INSTALL my_extension FROM 'https://my-extensions.com';")
conn.execute("LOAD my_extension;")
```

## Configuration and Settings

### Memory Management

```python
# Set memory limit
conn.execute("SET memory_limit = '4GB'")

# Set maximum threads (default = CPU cores)
conn.execute("SET threads = 8")

# External streaming for large sorts/joins
conn.execute("SET enable_external_access = true")
conn.execute("SET temp_directory = '/tmp/duckdb'")

# Preserve insertion order (disable for better parallelism)
conn.execute("SET preserve_insertion_order = false")
```

### Query Behavior

```python
# Progress bar for long queries
conn.execute("SET enable_progress_bar = true")
conn.execute("SET enable_progress_bar_print = true")

# Profiling
conn.execute("SET enable_profiling = 'json'")
conn.execute("SET profiling_output = 'profile.json'")
conn.execute("SET profiling_mode = 'detailed'")

# Query logging
conn.execute("SET log_query_path = 'queries.log'")

# Explain analyze
conn.execute("EXPLAIN ANALYZE SELECT * FROM large_table")
```

### CSV-Specific Settings

```python
# Parallel CSV reading
conn.execute("SET preserve_insertion_order = false")

# Date format
conn.execute("SET date_format = '%Y-%m-%d'")
conn.execute("SET timestamp_format = '%Y-%m-%d %H:%M:%S'")

# CSV buffer size
conn.execute("SET csv_buffer_size = 1048576")
```

## Production Patterns

### Connection Pool

```python
from contextlib import contextmanager
import queue

class DuckDBPool:
    def __init__(self, db_path: str, pool_size: int = 4):
        self.db_path = db_path
        self.pool = queue.Queue()
        for _ in range(pool_size):
            self.pool.put(duckdb.connect(db_path))
    
    @contextmanager
    def acquire(self):
        conn = self.pool.get()
        try:
            yield conn
        finally:
            self.pool.put(conn)

# Usage
pool = DuckDBPool("analytics.db", pool_size=4)

with pool.acquire() as conn:
    result = conn.execute("SELECT * FROM events LIMIT 100").fetchdf()
```

### Application Integration (FastAPI)

```python
from fastapi import FastAPI, Depends
import duckdb
from contextlib import contextmanager

app = FastAPI()

@contextmanager
def get_db():
    conn = duckdb.connect("analytics.db")
    try:
        yield conn
    finally:
        conn.close()

@app.get("/events")
def list_events(limit: int = 100, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    df = conn.execute(
        "SELECT * FROM events LIMIT ?", 
        [limit]
    ).fetchdf()
    return df.to_dict(orient='records')

@app.get("/events/{event_id}")
def get_event(event_id: int, conn: duckdb.DuckDBPyConnection = Depends(get_db)):
    row = conn.execute(
        "SELECT * FROM events WHERE id = ?",
        [event_id]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return dict(row)
```

### ETL Pipeline Class

```python
from typing import List, Callable, Optional
import logging

class DuckDBETL:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn: Optional[duckdb.DuckDBPyConnection] = None
        self.transformations: List[Callable] = []
        self.logger = logging.getLogger(__name__)
    
    def __enter__(self):
        self.conn = duckdb.connect(self.db_path)
        self.logger.info(f"Connected to {self.db_path}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
            self.logger.info("Connection closed")
    
    def extract(self, source: str, table_name: str, **options):
        """Extract data from source file to table."""
        self.logger.info(f"Extracting from {source} to {table_name}")
        
        if source.endswith('.csv'):
            self.conn.execute(f"""
                CREATE TABLE {table_name} AS
                SELECT * FROM read_csv_auto('{source}', **options)
            """)
        elif source.endswith('.parquet'):
            self.conn.execute(f"""
                CREATE TABLE {table_name} AS
                SELECT * FROM read_parquet('{source}')
            """)
        elif source.endswith('.json') or source.endswith('.jsonl'):
            self.conn.execute(f"""
                CREATE TABLE {table_name} AS
                SELECT * FROM read_json_auto('{source}')
            """)
        
        count = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        self.logger.info(f"Loaded {count} rows into {table_name}")
        return self
    
    def transform(self, func: Callable):
        """Add transformation function to pipeline."""
        self.transformations.append(func)
        return self
    
    def load(self, target_table: str):
        """Apply transformations and load to target."""
        self.logger.info(f"Loading to {target_table}")
        
        # Start with source table
        rel = self.conn.table("source")
        
        # Apply transformations
        for transform in self.transformations:
            rel = transform(rel)
        
        # Create target table
        rel.create(target_table, replace=True)
        
        count = self.conn.execute(f"SELECT COUNT(*) FROM {target_table}").fetchone()[0]
        self.logger.info(f"Loaded {count} rows into {target_table}")
        return self
    
    def export(self, target: str, format: str = "parquet"):
        """Export to file."""
        self.logger.info(f"Exporting to {target}")
        
        if format == "parquet":
            self.conn.execute(f"""
                COPY (SELECT * FROM target) TO '{target}' (FORMAT PARQUET)
            """)
        elif format == "csv":
            self.conn.execute(f"""
                COPY (SELECT * FROM target) TO '{target}' (FORMAT CSV, HEADER)
            """)

# Usage
with DuckDBETL("pipeline.db") as etl:
    etl.extract("source.csv", "source") \
       .transform(lambda r: r.filter("value > 100")) \
       .transform(lambda r: r.project("id, value * 2 as doubled_value")) \
       .load("transformed") \
       .export("output.parquet")
```

### Testing with DuckDB

```python
import pytest
import duckdb

@pytest.fixture
def test_db():
    """Create in-memory database with test data."""
    conn = duckdb.connect(":memory:")
    
    conn.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name VARCHAR,
            email VARCHAR
        )
    """)
    
    conn.execute("""
        INSERT INTO users VALUES
            (1, 'Alice', 'alice@example.com'),
            (2, 'Bob', 'bob@example.com'),
            (3, 'Charlie', 'charlie@example.com')
    """)
    
    yield conn
    conn.close()

def test_user_count(test_db):
    result = test_db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    assert result == 3

def test_user_filter(test_db):
    df = test_db.execute(
        "SELECT * FROM users WHERE name LIKE 'A%'"
    ).fetchdf()
    assert len(df) == 1
    assert df.iloc[0]['name'] == 'Alice'

# Parametrized tests
@pytest.mark.parametrize("name,expected_email", [
    ("Alice", "alice@example.com"),
    ("Bob", "bob@example.com"),
])
def test_user_lookup(test_db, name, expected_email):
    result = test_db.execute(
        "SELECT email FROM users WHERE name = ?",
        [name]
    ).fetchone()
    assert result[0] == expected_email
```

## Debugging and Profiling

### Query Plans

```python
# Explain query
plan = conn.execute("EXPLAIN SELECT * FROM events WHERE value > 100").fetchall()
print(plan)

# Explain with profiling (executes query)
plan = conn.execute("EXPLAIN ANALYZE SELECT * FROM events").fetchall()
print(plan)

# Detailed profiling
conn.execute("SET enable_profiling = 'json'")
conn.execute("SET profiling_output = 'profile.json'")
conn.execute("SET profiling_mode = 'detailed'")
conn.execute("SELECT * FROM large_table")

# Read profile
import json
with open('profile.json') as f:
    profile = json.load(f)
    print(profile['timing'])
```

### Memory Usage

```python
# Check memory usage
result = conn.execute("""
    SELECT 
        database_name,
        schema_name,
        table_name,
        estimated_size
    FROM duckdb_tables()
""").fetchdf()

# Column statistics
result = conn.execute("""
    SELECT * FROM pragma_table_info('events')
""").fetchdf()
```

## Error Handling

```python
from contextlib import contextmanager

@contextmanager
def safe_execution(conn):
    """Context manager for safe transaction handling."""
    conn.execute("BEGIN TRANSACTION")
    try:
        yield conn
        conn.execute("COMMIT")
    except Exception as e:
        conn.execute("ROLLBACK")
        raise RuntimeError(f"Transaction failed: {e}")

# Usage
try:
    with safe_execution(conn):
        conn.execute("INSERT INTO accounts VALUES (1, 100)")
        conn.execute("INSERT INTO accounts VALUES (2, 200)")
except RuntimeError as e:
    print(f"Error: {e}")

# Custom error handling for specific errors
def handle_duckdb_error(func):
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except duckdb.Error as e:
            error_msg = str(e)
            if "TransactionContext Error" in error_msg:
                raise RuntimeError("Concurrent access detected. Use connection per thread.")
            elif "Out of Memory" in error_msg:
                raise RuntimeError("Query exceeded memory limit. Try smaller batches.")
            else:
                raise
    return wrapper

@handle_duckdb_error
def run_query(conn, query):
    return conn.execute(query).fetchdf()
```
