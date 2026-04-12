# DuckDB Relational API

Lazy query building and pipeline construction with the Relational API.

## Overview

The Relational API provides a lazy, functional interface for building SQL queries programmatically. Unlike direct SQL execution, the Relational API builds a query plan that only executes when you explicitly fetch results.

## When to Use Relational API vs SQL

| Use Relational API | Use SQL Directly |
|-------------------|------------------|
| Building dynamic queries | Simple one-off queries |
| Multi-step data pipelines | Complex analytical queries |
| Programmatic query construction | Ad-hoc exploration |
| Reusable transformation components | When SQL is clearer |

## Basic Usage

### Creating Relations

```python
import duckdb

conn = duckdb.connect()

# From existing table
rel = conn.table("events")

# From query string
rel = conn.sql("SELECT * FROM events WHERE value > 100")

# From DataFrame
import pandas as pd
df = pd.DataFrame({"x": [1, 2, 3], "y": ["a", "b", "c"]})
rel = conn.from_df(df)

# From query result
rel = conn.from_query("SELECT * FROM read_parquet('data.parquet')")
```

### Query Methods

All methods return new relations (immutable, chainable):

```python
# Filter (WHERE clause)
filtered = rel.filter("value > 100 AND status = 'active'")

# Project (SELECT columns)
projected = rel.project("id, value, timestamp")

# Alias columns
aliased = rel.project("id, value * 100 as value_cents")

# Aggregate
aggregated = (
    rel
    .aggregate("category", "sum(value) as total, count(*) as count")
)

# Order
ordered = rel.order("timestamp DESC")

# Limit
limited = rel.limit(100)

# Distinct
distinct = rel.distinct()
```

## Building Pipelines

### Chaining Operations

```python
# Complex analysis pipeline
result = (
    conn.table("events")
    .filter("timestamp > CURRENT_DATE - INTERVAL '30 days'")
    .filter("event_type IN ('purchase', 'signup')")
    .project("user_id, event_type, value, DATE(timestamp) as date")
    .aggregate("user_id, date", "sum(value) as daily_value, count(*) as event_count")
    .filter("daily_value > 100")
    .order("daily_value DESC")
    .limit(100)
    .fetchdf()
)
```

### Conditional Logic

```python
def build_pipeline(conn, filters: dict, sort_by: str = "timestamp"):
    rel = conn.table("events")
    
    # Apply filters dynamically
    if filters.get("start_date"):
        rel = rel.filter(f"timestamp >= '{filters['start_date']}'")
    
    if filters.get("event_types"):
        types = ", ".join(f"'{t}'" for t in filters["event_types"])
        rel = rel.filter(f"event_type IN ({types})")
    
    if filters.get("min_value"):
        rel = rel.filter(f"value >= {filters['min_value']}")
    
    # Always apply projection and ordering
    rel = rel.project("id, user_id, event_type, value, timestamp")
    rel = rel.order(f"{sort_by} DESC")
    
    return rel

# Usage
pipeline = build_pipeline(conn, {
    "start_date": "2024-01-01",
    "event_types": ["purchase", "refund"],
    "min_value": 50
})
result = pipeline.fetchdf()
```

## Joins

### Basic Joins

```python
# Define relations
users = conn.table("users")
orders = conn.table("orders")

# Inner join
joined = users.join(orders, "users.id = orders.user_id")

# Left join
left_joined = users.left_join(orders, "users.id = orders.user_id")

# Cross join
cross = users.cross_join(orders)

# Multiple joins
result = (
    conn.table("orders")
    .join(conn.table("users"), "orders.user_id = users.id")
    .join(conn.table("products"), "orders.product_id = products.id")
    .project("orders.id, users.name, products.title, orders.total")
)
```

### Complex Join Conditions

```python
# Range join (theta join)
result = (
    conn.table("events")
    .join(
        conn.table("sessions"),
        """
        events.user_id = sessions.user_id AND
        events.timestamp BETWEEN sessions.start_time AND sessions.end_time
        """
    )
)

# Using aliases
users = conn.table("users")
orders = conn.table("orders")
result = users.join(
    orders.alias("o"),
    "users.id = o.user_id"
)
```

## Set Operations

```python
users_2023 = conn.sql("SELECT email FROM users WHERE year = 2023")
users_2024 = conn.sql("SELECT email FROM users WHERE year = 2024")

# Union
both_years = users_2023.union(users_2024)

# Union all (with duplicates)
all_records = users_2023.union_all(users_2024)

# Intersect
both_years = users_2023.intersect(users_2024)

# Except (set difference)
only_2023 = users_2023.except_(users_2024)
```

## Subqueries

### Correlated Subqueries

```python
# Find users with above-average order values
users = conn.table("users")
orders = conn.table("orders")

result = users.filter(f"""
    id IN (
        SELECT user_id 
        FROM orders 
        GROUP BY user_id 
        HAVING AVG(total) > (
            SELECT AVG(total) FROM orders
        )
    )
""")
```

### CTEs (Common Table Expressions)

```python
# Define CTEs
cte1 = conn.sql("SELECT user_id, COUNT(*) as order_count FROM orders GROUP BY 1")
cte2 = conn.sql("SELECT user_id, SUM(total) as lifetime_value FROM orders GROUP BY 1")

# Reference CTEs in main query
result = conn.sql(f"""
    SELECT 
        a.user_id,
        a.order_count,
        b.lifetime_value,
        b.lifetime_value / a.order_count as avg_order_value
    FROM {cte1.alias('a')} 
    JOIN {cte2.alias('b')} ON a.user_id = b.user_id
""")
```

## Window Functions

```python
rel = conn.table("sales")

# Row number
ranked = conn.sql(f"""
    SELECT *, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) as rank
    FROM {rel.alias()}
""")

# Running totals
running = conn.sql(f"""
    SELECT 
        *,
        SUM(amount) OVER (PARTITION BY region ORDER BY date) as running_total,
        AVG(amount) OVER (PARTITION BY region ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg
    FROM {rel.alias()}
""")

# First/last value
with_bounds = conn.sql(f"""
    SELECT
        *,
        FIRST_VALUE(amount) OVER (PARTITION BY region ORDER BY date) as first_sale,
        LAST_VALUE(amount) OVER (PARTITION BY region ORDER BY date) as latest_sale
    FROM {rel.alias()}
""")
```

## Executing Relations

### Fetch Methods

```python
rel = conn.table("events")

# Fetch as DataFrame
df = rel.fetchdf()

# Fetch as Polars DataFrame
pl_df = rel.fetch_pl()

# Fetch as Arrow Table
arrow_table = rel.fetch_arrow_table()

# Fetch as Arrow reader (streaming)
reader = rel.fetch_arrow_reader()
for batch in reader:
    process_batch(batch)

# Fetch all rows as tuples
rows = rel.fetchall()

# Fetch one row
row = rel.fetchone()

# Fetch as records (dict-like)
records = rel.fetchmany(100)  # First 100 rows
```

### Inspecting Without Executing

```python
rel = conn.table("events").filter("value > 100")

# Get query plan (doesn't execute)
print(rel.explain())

# Get query plan with profiling (executes)
print(rel.explain("analyze"))

# Get SQL string
print(rel.sql_query())

# Get column names
columns = rel.columns
# ['id', 'user_id', 'event_type', 'value', 'timestamp']

# Get column types
types = rel.types
# ['INTEGER', 'INTEGER', 'VARCHAR', 'DOUBLE', 'TIMESTAMP']
```

## Creating Tables from Relations

```python
# Create table from relation
rel = conn.table("events").filter("value > 1000")
rel.create("high_value_events")

# Create or replace
rel.create("high_value_events", replace=True)

# Create temporary table
rel.create("temp_high_value", temp=True)

# Insert into existing table
rel.insert_into("archive_table")
```

## Advanced Patterns

### Query Builder Class

```python
class AnalyticsQueryBuilder:
    def __init__(self, conn: duckdb.DuckDBPyConnection):
        self.conn = conn
        self._rel = None
        self._filters = []
        self._projections = []
        self._aggregations = []
        self._group_by = []
        self._order_by = []
        self._limit = None
    
    def from_table(self, table_name: str):
        self._rel = self.conn.table(table_name)
        return self
    
    def from_sql(self, sql: str):
        self._rel = self.conn.sql(sql)
        return self
    
    def where(self, condition: str):
        self._filters.append(condition)
        return self
    
    def select(self, *columns: str):
        self._projections.extend(columns)
        return self
    
    def group_by(self, *columns: str):
        self._group_by.extend(columns)
        return self
    
    def aggregate(self, **aggregations: str):
        self._aggregations.extend([f"{v} as {k}" for k, v in aggregations.items()])
        return self
    
    def order_by(self, *columns: str):
        self._order_by.extend(columns)
        return self
    
    def limit_results(self, n: int):
        self._limit = n
        return self
    
    def build(self) -> duckdb.DuckDBPyRelation:
        if self._rel is None:
            raise ValueError("No source specified")
        
        rel = self._rel
        
        # Apply filters
        for condition in self._filters:
            rel = rel.filter(condition)
        
        # Apply aggregations or projections
        if self._aggregations:
            group_cols = ", ".join(self._group_by) if self._group_by else ""
            agg_cols = ", ".join(self._aggregations)
            select_cols = f"{group_cols}, {agg_cols}" if group_cols else agg_cols
            rel = rel.aggregate(group_cols, agg_cols) if group_cols else rel.project(select_cols)
        elif self._projections:
            rel = rel.project(", ".join(self._projections))
        
        # Apply ordering
        for col in self._order_by:
            rel = rel.order(col)
        
        # Apply limit
        if self._limit:
            rel = rel.limit(self._limit)
        
        return rel
    
    def execute(self):
        return self.build().fetchdf()

# Usage
builder = AnalyticsQueryBuilder(conn)
result = (
    builder
    .from_table("events")
    .where("timestamp > '2024-01-01'")
    .where("event_type = 'purchase'")
    .select("user_id", "value", "timestamp")
    .aggregate(total="sum(value)", count="count(*)")
    .group_by("user_id")
    .order_by("total DESC")
    .limit_results(100)
    .execute()
)
```

### Reusable Transformation Components

```python
from typing import Callable
import duckdb

# Define transformation functions
def add_time_features(rel: duckdb.DuckDBPyRelation) -> duckdb.DuckDBPyRelation:
    return rel.project(f"""
        *,
        EXTRACT(year FROM timestamp) as year,
        EXTRACT(month FROM timestamp) as month,
        EXTRACT(day FROM timestamp) as day,
        EXTRACT(hour FROM timestamp) as hour,
        DATE_TRUNC('week', timestamp) as week_start
    """)

def add_rolling_metrics(
    rel: duckdb.DuckDBPyRelation,
    partition_col: str = "user_id",
    order_col: str = "timestamp",
    value_col: str = "value"
) -> duckdb.DuckDBPyRelation:
    return conn.sql(f"""
        SELECT
            *,
            SUM({value_col}) OVER (
                PARTITION BY {partition_col} 
                ORDER BY {order_col}
            ) as running_total,
            AVG({value_col}) OVER (
                PARTITION BY {partition_col}
                ORDER BY {order_col}
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            ) as rolling_avg
        FROM {rel.alias()}
    """)

def filter_anomalies(
    rel: duckdb.DuckDBPyRelation,
    value_col: str = "value",
    z_threshold: float = 3.0
) -> duckdb.DuckDBPyRelation:
    return conn.sql(f"""
        SELECT *
        FROM {rel.alias()}
        WHERE ABS(({value_col} - AVG({value_col}) OVER ()) / 
                  STDDEV({value_col}) OVER ()) < {z_threshold}
    """)

# Compose transformations
pipeline = (
    conn.table("events")
    .pipe(add_time_features)
    .pipe(lambda r: add_rolling_metrics(r, "user_id", "timestamp", "value"))
    .pipe(lambda r: filter_anomalies(r, "value", 3.0))
)

result = pipeline.fetchdf()
```

## Optimization Tips

### 1. Filter Pushdown

Filters are pushed to the source when possible:

```python
# This only reads matching rows from parquet
result = (
    conn.sql("SELECT * FROM 'data/*.parquet'")
    .filter("date > '2024-01-01'")  # Pushed to parquet reader
    .fetchdf()
)
```

### 2. Projection Pushdown

Only requested columns are read:

```python
# Only reads 'user_id' and 'value' from parquet
result = (
    conn.sql("SELECT * FROM 'data/*.parquet'")
    .project("user_id, value")
    .fetchdf()
)
```

### 3. Limit Pushdown

```python
# Stops reading after 100 rows
result = (
    conn.sql("SELECT * FROM 'large.parquet'")
    .limit(100)
    .fetchdf()
)
```

### 4. Avoid Repeated Execution

```python
# BAD: Executes twice
rel = conn.table("events").filter("value > 100")
count = len(rel.fetchall())  # Executes
sample = rel.limit(10).fetchdf()  # Executes again

# GOOD: Materialize intermediate result
rel = conn.table("events").filter("value > 100").create("filtered_events", temp=True)
count = conn.execute("SELECT COUNT(*) FROM filtered_events").fetchone()[0]
sample = conn.execute("SELECT * FROM filtered_events LIMIT 10").fetchdf()
```

## Common Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Chaining too many operations | Hard to debug | Break into named intermediates |
| Using `fetchdf()` on large data | Memory exhaustion | Use `fetch_arrow_reader()` or `limit()` |
| Not using `alias()` in subqueries | Name conflicts | Always alias subquery relations |
| Mixing SQL and Relational | Inconsistent style | Pick one per module |
| Forgetting relations are lazy | Unexpected execution | Call `explain()` to see the plan |
