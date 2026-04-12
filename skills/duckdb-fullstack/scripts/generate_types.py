#!/usr/bin/env python3
"""Generate TypeScript types from DuckDB query results.

Usage: python generate_types.py "SELECT * FROM table" --output types.ts
"""
import duckdb
import sys
import argparse
import re


def duckdb_type_to_typescript(duckdb_type: str) -> str:
    """Map DuckDB types to TypeScript types."""
    type_map = {
        "BOOLEAN": "boolean",
        "TINYINT": "number",
        "SMALLINT": "number",
        "INTEGER": "number",
        "BIGINT": "number",
        "UTINYINT": "number",
        "USMALLINT": "number",
        "UINTEGER": "number",
        "UBIGINT": "number",
        "FLOAT": "number",
        "DOUBLE": "number",
        "DECIMAL": "number",
        "VARCHAR": "string",
        "CHAR": "string",
        "TEXT": "string",
        "BLOB": "Uint8Array",
        "DATE": "Date",
        "TIME": "string",
        "TIMESTAMP": "Date",
        "TIMESTAMPTZ": "Date",
        "INTERVAL": "string",
        "UUID": "string",
    }
    
    # Handle arrays
    if "[]" in duckdb_type:
        base = duckdb_type.replace("[]", "")
        ts_base = type_map.get(base, "unknown")
        return f"{ts_base}[]"
    
    # Handle MAP
    if duckdb_type.startswith("MAP("):
        return "Record<string, any>"
    
    # Handle STRUCT
    if duckdb_type.startswith("STRUCT("):
        # Extract fields
        fields = re.findall(r'(\w+)\s+(\w+)', duckdb_type)
        ts_fields = [f"{name}: {duckdb_type_to_typescript(type_)}" for name, type_ in fields]
        return f"{{ {', '.join(ts_fields)} }}"
    
    return type_map.get(duckdb_type, "unknown")


def generate_types(sql: str, interface_name: str = "QueryResult") -> str:
    """Generate TypeScript interface from SQL query."""
    con = duckdb.connect(":memory:")
    
    try:
        # Create dummy data to get types
        con.execute("CREATE TEMP TABLE _temp AS " + sql + " LIMIT 0")
        result = con.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '_temp'")
        columns = result.fetchall()
        con.execute("DROP TABLE _temp")
        
        lines = [f"export interface {interface_name} {{"]
        for col_name, data_type in columns:
            ts_type = duckdb_type_to_typescript(data_type)
            lines.append(f"  {col_name}: {ts_type};")
        lines.append("}")
        
        return "\n".join(lines)
        
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description="Generate TypeScript types from DuckDB SQL")
    parser.add_argument("sql", help="SQL query")
    parser.add_argument("--name", "-n", default="QueryResult", help="Interface name")
    parser.add_argument("--output", "-o", help="Output file (default: stdout)")
    
    args = parser.parse_args()
    
    try:
        ts_code = generate_types(args.sql, args.name)
        
        if args.output:
            with open(args.output, "w") as f:
                f.write(ts_code)
            print(f"✅ Types written to {args.output}")
        else:
            print(ts_code)
            
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
