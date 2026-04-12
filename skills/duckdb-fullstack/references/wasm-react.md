# DuckDB-WASM + React Integration

Building React components with in-browser DuckDB analytics.

## Setup

### Installation

```bash
npm install @duckdb/duckdb-wasm
npm install -D @types/duckdb-wasm  # If types available
```

### React Hook: useDuckDB

```typescript
// hooks/useDuckDB.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

interface DuckDBState {
  db: duckdb.AsyncDuckDB | null;
  conn: duckdb.AsyncDuckDBConnection | null;
  isLoading: boolean;
  error: Error | null;
}

export function useDuckDB() {
  const [state, setState] = useState<DuckDBState>({
    db: null,
    conn: null,
    isLoading: true,
    error: null
  });
  
  const workerRef = useRef<Worker | null>(null);
  const workerUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function init() {
      try {
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        const worker_url = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], {type: 'text/javascript'})
        );
        workerUrlRef.current = worker_url;

        const worker = new Worker(worker_url);
        workerRef.current = worker;

        const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
        const db = new duckdb.AsyncDuckDB(logger, worker);
        
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        const conn = await db.connect();

        if (!isCancelled) {
          setState({ db, conn, isLoading: false, error: null });
        }
      } catch (error) {
        if (!isCancelled) {
          setState(prev => ({ ...prev, isLoading: false, error: error as Error }));
        }
      }
    }

    init();

    return () => {
      isCancelled = true;
      state.conn?.close();
      state.db?.terminate();
      if (workerUrlRef.current) {
        URL.revokeObjectURL(workerUrlRef.current);
      }
    };
  }, []);

  const query = useCallback(async (sql: string) => {
    if (!state.conn) {
      throw new Error('DuckDB not initialized');
    }
    return state.conn.query(sql);
  }, [state.conn]);

  const registerFile = useCallback(async (name: string, buffer: Uint8Array) => {
    if (!state.db) {
      throw new Error('DuckDB not initialized');
    }
    return state.db.registerFileBuffer(name, buffer);
  }, [state.db]);

  return {
    ...state,
    query,
    registerFile
  };
}
```

### Provider Pattern

```typescript
// contexts/DuckDBContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { useDuckDB } from '../hooks/useDuckDB';
import * as duckdb from '@duckdb/duckdb-wasm';

interface DuckDBContextType {
  db: duckdb.AsyncDuckDB | null;
  conn: duckdb.AsyncDuckDBConnection | null;
  isLoading: boolean;
  error: Error | null;
  query: (sql: string) => Promise<duckdb.AsyncQueryResult>;
  registerFile: (name: string, buffer: Uint8Array) => Promise<void>;
}

const DuckDBContext = createContext<DuckDBContextType | null>(null);

export function DuckDBProvider({ children }: { children: ReactNode }) {
  const duckdbState = useDuckDB();

  return (
    <DuckDBContext.Provider value={duckdbState}>
      {children}
    </DuckDBContext.Provider>
  );
}

export function useDuckDBContext() {
  const context = useContext(DuckDBContext);
  if (!context) {
    throw new Error('useDuckDBContext must be used within DuckDBProvider');
  }
  return context;
}
```

### App Setup

```typescript
// App.tsx
import { DuckDBProvider } from './contexts/DuckDBContext';
import { DataExplorer } from './components/DataExplorer';

function App() {
  return (
    <DuckDBProvider>
      <DataExplorer />
    </DuckDBProvider>
  );
}

export default App;
```

## Components

### File Upload Component

```typescript
// components/FileUpload.tsx
import React, { useCallback } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';

interface FileUploadProps {
  onDataLoaded: (tableName: string, rowCount: number) => void;
}

export function FileUpload({ onDataLoaded }: FileUploadProps) {
  const { registerFile, query, isLoading } = useDuckDBContext();

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      await registerFile(file.name, uint8Array);

      let tableName = 'uploaded_data';
      
      if (file.name.endsWith('.csv')) {
        await query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${file.name}')`);
      } else if (file.name.endsWith('.parquet')) {
        await query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${file.name}')`);
      } else if (file.name.endsWith('.json') || file.name.endsWith('.jsonl')) {
        await query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_json_auto('${file.name}')`);
      }

      const result = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = Number(result.toArray()[0].count);
      
      onDataLoaded(tableName, rowCount);
    } catch (error) {
      console.error('Failed to load file:', error);
      alert('Failed to load file. Check console for details.');
    }
  }, [registerFile, query, onDataLoaded]);

  if (isLoading) {
    return <div>Initializing DuckDB...</div>;
  }

  return (
    <div className="file-upload">
      <input
        type="file"
        accept=".csv,.parquet,.json,.jsonl"
        onChange={handleFileUpload}
        disabled={isLoading}
      />
      <p>Upload CSV, Parquet, or JSON file</p>
    </div>
  );
}
```

### SQL Query Editor

```typescript
// components/QueryEditor.tsx
import React, { useState, useCallback } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';

export function QueryEditor() {
  const [sql, setSql] = useState('SELECT * FROM uploaded_data LIMIT 100');
  const [results, setResults] = useState<any[] | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const { query } = useDuckDBContext();

  const executeQuery = useCallback(async () => {
    setIsExecuting(true);
    const startTime = performance.now();

    try {
      const result = await query(sql);
      const rows = result.toArray();
      const schema = result.schema;
      
      setResults(rows);
      setColumns(schema.fields.map(f => f.name));
      setExecutionTime(performance.now() - startTime);
    } catch (error) {
      console.error('Query failed:', error);
      alert(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExecuting(false);
    }
  }, [sql, query]);

  return (
    <div className="query-editor">
      <div className="editor-section">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={6}
          className="sql-input"
          placeholder="Enter SQL query..."
        />
        <button 
          onClick={executeQuery} 
          disabled={isExecuting}
          className="execute-btn"
        >
          {isExecuting ? 'Executing...' : 'Execute'}
        </button>
      </div>

      {executionTime !== null && (
        <div className="execution-info">
          Executed in {executionTime.toFixed(2)}ms
          {results && ` • ${results.length} rows`}
        </div>
      )}

      {results && (
        <div className="results-table">
          <table>
            <thead>
              <tr>
                {columns.map(col => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col}>{String(row[col])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

### Data Table with Pagination

```typescript
// components/PaginatedTable.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';

interface PaginatedTableProps {
  tableName: string;
  pageSize?: number;
}

export function PaginatedTable({ tableName, pageSize = 50 }: PaginatedTableProps) {
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { query } = useDuckDBContext();

  const loadPage = useCallback(async (page: number) => {
    setIsLoading(true);
    try {
      // Get total count
      const countResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
      setTotalRows(Number(countResult.toArray()[0].count));

      // Get page data
      const offset = page * pageSize;
      const result = await query(`
        SELECT * FROM ${tableName}
        LIMIT ${pageSize}
        OFFSET ${offset}
      `);

      setData(result.toArray());
      setColumns(result.schema.fields.map(f => f.name));
      setCurrentPage(page);
    } catch (error) {
      console.error('Failed to load page:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tableName, pageSize, query]);

  useEffect(() => {
    loadPage(0);
  }, [tableName, loadPage]);

  const totalPages = Math.ceil(totalRows / pageSize);

  return (
    <div className="paginated-table">
      <div className="table-info">
        Showing {currentPage * pageSize + 1} - {Math.min((currentPage + 1) * pageSize, totalRows)} of {totalRows} rows
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map(col => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {columns.map(col => <td key={col}>{String(row[col])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <button 
          onClick={() => loadPage(currentPage - 1)}
          disabled={currentPage === 0 || isLoading}
        >
          Previous
        </button>
        
        <span>Page {currentPage + 1} of {totalPages}</span>
        
        <button 
          onClick={() => loadPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1 || isLoading}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### Aggregation Dashboard

```typescript
// components/AggregationDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';

interface AggregationDashboardProps {
  tableName: string;
}

export function AggregationDashboard({ tableName }: AggregationDashboardProps) {
  const [groupByColumn, setGroupByColumn] = useState<string>('');
  const [aggColumn, setAggColumn] = useState<string>('');
  const [aggFunction, setAggFunction] = useState<string>('COUNT');
  const [columns, setColumns] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { query } = useDuckDBContext();

  // Get column names
  useEffect(() => {
    async function getColumns() {
      try {
        const result = await query(`PRAGMA table_info(${tableName})`);
        const cols = result.toArray().map((row: any) => row.name);
        setColumns(cols);
        if (cols.length > 0) {
          setGroupByColumn(cols[0]);
          setAggColumn(cols[0]);
        }
      } catch (error) {
        console.error('Failed to get columns:', error);
      }
    }
    getColumns();
  }, [tableName, query]);

  const runAggregation = useCallback(async () => {
    if (!groupByColumn || !aggColumn) return;

    setIsLoading(true);
    try {
      const aggQuery = aggFunction === 'COUNT' 
        ? `SELECT ${groupByColumn}, COUNT(*) as count FROM ${tableName} GROUP BY ${groupByColumn} ORDER BY count DESC`
        : `SELECT ${groupByColumn}, ${aggFunction}(${aggColumn}) as value FROM ${tableName} GROUP BY ${groupByColumn} ORDER BY value DESC`;
      
      const result = await query(aggQuery);
      setResults(result.toArray());
    } catch (error) {
      console.error('Aggregation failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [groupByColumn, aggColumn, aggFunction, tableName, query]);

  return (
    <div className="aggregation-dashboard">
      <h3>Aggregation Builder</h3>
      
      <div className="controls">
        <label>
          Group By:
          <select value={groupByColumn} onChange={(e) => setGroupByColumn(e.target.value)}>
            {columns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </label>

        <label>
          Aggregate:
          <select value={aggFunction} onChange={(e) => setAggFunction(e.target.value)}>
            <option value="COUNT">COUNT</option>
            <option value="SUM">SUM</option>
            <option value="AVG">AVG</option>
            <option value="MIN">MIN</option>
            <option value="MAX">MAX</option>
          </select>
        </label>

        {aggFunction !== 'COUNT' && (
          <label>
            Column:
            <select value={aggColumn} onChange={(e) => setAggColumn(e.target.value)}>
              {columns.map(col => <option key={col} value={col}>{col}</option>)}
            </select>
          </label>
        )}

        <button onClick={runAggregation} disabled={isLoading}>
          {isLoading ? 'Running...' : 'Run Aggregation'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="results">
          <table>
            <thead>
              <tr>
                <th>{groupByColumn}</th>
                <th>{aggFunction === 'COUNT' ? 'Count' : aggFunction}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i}>
                  <td>{String(row[groupByColumn])}</td>
                  <td>{String(aggFunction === 'COUNT' ? row.count : row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

## Data Flow Patterns

### Pattern 1: Local Data Analysis

```typescript
// scenarios/LocalAnalysis.tsx
import React, { useState } from 'react';
import { FileUpload } from '../components/FileUpload';
import { QueryEditor } from '../components/QueryEditor';
import { AggregationDashboard } from '../components/AggregationDashboard';

export function LocalAnalysis() {
  const [tableName, setTableName] = useState<string | null>(null);

  return (
    <div className="local-analysis">
      <h1>Local Data Analysis</h1>
      
      {!tableName ? (
        <FileUpload 
          onDataLoaded={(name, count) => {
            console.log(`Loaded ${count} rows into ${name}`);
            setTableName(name);
          }} 
        />
      ) : (
        <>
          <div className="loaded-info">
            Data loaded: <code>{tableName}</code>
          </div>
          
          <QueryEditor />
          <AggregationDashboard tableName={tableName} />
        </>
      )}
    </div>
  );
}
```

### Pattern 2: Server + Client Hybrid

```typescript
// scenarios/HybridAnalytics.tsx
import React, { useEffect, useState } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';

interface HybridAnalyticsProps {
  apiEndpoint: string;
}

export function HybridAnalytics({ apiEndpoint }: HybridAnalyticsProps) {
  const { registerFile, query } = useDuckDBContext();
  const [isLoading, setIsLoading] = useState(false);

  // Load data from API into DuckDB
  const loadFromServer = async () => {
    setIsLoading(true);
    try {
      // Fetch pre-aggregated data from server
      const response = await fetch(`${apiEndpoint}/summary`);
      const buffer = await response.arrayBuffer();
      
      await registerFile('summary.parquet', new Uint8Array(buffer));
      await query("CREATE TABLE summary AS SELECT * FROM read_parquet('summary.parquet')");
      
      // Now do client-side drill-down
      const result = await query(`
        SELECT category, SUM(value) as total
        FROM summary
        GROUP BY category
        ORDER BY total DESC
      `);
      
      return result.toArray();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFromServer();
  }, []);

  return (
    <div>
      {isLoading ? 'Loading...' : 'Data loaded from server'}
    </div>
  );
}
```

### Pattern 3: Real-time Filtering

```typescript
// components/RealTimeFilter.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';
import { useDebounce } from '../hooks/useDebounce';

interface RealTimeFilterProps {
  tableName: string;
}

export function RealTimeFilter({ tableName }: RealTimeFilterProps) {
  const [filter, setFilter] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);
  const { query } = useDuckDBContext();
  
  const debouncedFilter = useDebounce(filter, 300);

  const applyFilter = useCallback(async () => {
    if (!debouncedFilter) {
      setResults([]);
      return;
    }

    setIsFiltering(true);
    try {
      // Dynamic filter query
      const result = await query(`
        SELECT * FROM ${tableName}
        WHERE 
          CAST(id AS VARCHAR) LIKE '%${debouncedFilter}%' OR
          name LIKE '%${debouncedFilter}%'
        LIMIT 50
      `);
      setResults(result.toArray());
    } catch (error) {
      console.error('Filter failed:', error);
    } finally {
      setIsFiltering(false);
    }
  }, [debouncedFilter, tableName, query]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

  return (
    <div className="real-time-filter">
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by ID or name..."
        className="filter-input"
      />
      
      {isFiltering && <span className="filtering-indicator">Filtering...</span>}
      
      {results.length > 0 && (
        <ul className="filter-results">
          {results.map((row, i) => (
            <li key={i}>
              {row.id}: {row.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

## Performance Optimizations

### Memoization

```typescript
// hooks/useMemoizedQuery.ts
import { useCallback, useRef } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';

export function useMemoizedQuery() {
  const { query } = useDuckDBContext();
  const cacheRef = useRef<Map<string, any>>(new Map());

  const memoizedQuery = useCallback(async (sql: string) => {
    if (cacheRef.current.has(sql)) {
      return cacheRef.current.get(sql);
    }

    const result = await query(sql);
    const data = result.toArray();
    cacheRef.current.set(sql, data);
    return data;
  }, [query]);

  const invalidateCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return { memoizedQuery, invalidateCache };
}
```

### Web Workers for Heavy Queries

```typescript
// workers/duckdb.worker.ts
import * as duckdb from '@duckdb/duckdb-wasm';

// Run heavy computations in worker to avoid blocking UI
self.onmessage = async (event) => {
  const { sql, fileBuffer, fileName } = event.data;
  
  // Initialize DuckDB in worker
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  
  const db = new duckdb.AsyncDuckDB(
    new duckdb.ConsoleLogger(),
    self as any
  );
  
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  
  // Load data
  await db.registerFileBuffer(fileName, fileBuffer);
  await conn.query(`CREATE TABLE data AS SELECT * FROM read_parquet('${fileName}')`);
  
  // Execute heavy query
  const startTime = performance.now();
  const result = await conn.query(sql);
  const executionTime = performance.now() - startTime;
  
  self.postMessage({
    results: result.toArray(),
    executionTime,
    columns: result.schema.fields.map(f => f.name)
  });
};
```

### Virtual Scrolling for Large Tables

```typescript
// components/VirtualTable.tsx
import React, { useRef, useEffect, useState } from 'react';
import { useDuckDBContext } from '../contexts/DuckDBContext';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualTableProps {
  tableName: string;
  rowHeight?: number;
  containerHeight?: number;
}

export function VirtualTable({ 
  tableName, 
  rowHeight = 35, 
  containerHeight = 400 
}: VirtualTableProps) {
  const [columns, setColumns] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [data, setData] = useState<Map<number, any>>(new Map());
  const { query } = useDuckDBContext();
  const parentRef = useRef<HTMLDivElement>(null);

  // Get table info
  useEffect(() => {
    async function init() {
      const colResult = await query(`PRAGMA table_info(${tableName})`);
      setColumns(colResult.toArray().map((r: any) => r.name));
      
      const countResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`);
      setRowCount(Number(countResult.toArray()[0].count));
    }
    init();
  }, [tableName, query]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5
  });

  // Load visible rows
  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    
    items.forEach(async (item) => {
      if (!data.has(item.index)) {
        const result = await query(`
          SELECT * FROM ${tableName} 
          LIMIT 1 
          OFFSET ${item.index}
        `);
        
        setData(prev => new Map(prev).set(item.index, result.toArray()[0]));
      }
    });
  }, [virtualizer.getVirtualItems(), tableName, query]);

  return (
    <div ref={parentRef} style={{ height: containerHeight, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        <table>
          <thead>
            <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {virtualizer.getVirtualItems().map(item => (
              <tr 
                key={item.key} 
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              >
                {data.has(item.index) ? (
                  columns.map(col => (
                    <td key={col}>{String(data.get(item.index)[col])}</td>
                  ))
                ) : (
                  <td colSpan={columns.length}>Loading...</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## Error Boundaries

```typescript
// components/DuckDBErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DuckDBErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DuckDB error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-fallback">
          <h2>Something went wrong with DuckDB</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage
function App() {
  return (
    <DuckDBErrorBoundary>
      <DuckDBProvider>
        <DataExplorer />
      </DuckDBProvider>
    </DuckDBErrorBoundary>
  );
}
```

## Testing

```typescript
// __tests__/useDuckDB.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { DuckDBProvider } from '../contexts/DuckDBContext';
import { useDuckDBContext } from '../contexts/DuckDBContext';

test('initializes DuckDB', async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <DuckDBProvider>{children}</DuckDBProvider>
  );

  const { result } = renderHook(() => useDuckDBContext(), { wrapper });

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.db).not.toBeNull();
  expect(result.current.conn).not.toBeNull();
});

test('executes query', async () => {
  const { result } = renderHook(() => useDuckDBContext(), { wrapper });

  await waitFor(() => expect(result.current.isLoading).toBe(false));

  const queryResult = await result.current.query('SELECT 42 as answer');
  expect(queryResult.toArray()[0].answer).toBe(42);
});
```
