#!/usr/bin/env python3
"""Validate DuckDB SQL syntax without executing.

Usage: python validate_sql.py "SELECT * FROM table"
       python validate_sql.py --file query.sql
"""
import duckdb
import sys
import argparse


def validate_sql(sql: str) -> tuple[bool, str]:
    """Validate SQL syntax using DuckDB's query planner.
    
    Returns (is_valid, error_message)
    """
    con = duckdb.connect(":memory:")
    try:
        # Use EXPLAIN to validate without executing
        con.execute(f"EXPLAIN {sql}")
        return True, ""
    except Exception as e:
        return False, str(e)
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description="Validate DuckDB SQL syntax")
    parser.add_argument("sql", nargs="?", help="SQL string to validate")
    parser.add_argument("--file", "-f", help="SQL file to validate")
    
    args = parser.parse_args()
    
    if args.file:
        with open(args.file, "r") as f:
            sql = f.read()
    elif args.sql:
        sql = args.sql
    else:
        print("Error: Provide SQL string or --file", file=sys.stderr)
        sys.exit(1)
    
    is_valid, error = validate_sql(sql)
    
    if is_valid:
        print("✅ SQL syntax is valid")
        sys.exit(0)
    else:
        print(f"❌ Invalid SQL: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
