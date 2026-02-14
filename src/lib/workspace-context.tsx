'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { db } from '@/lib/db';
import type {
  CellValue,
  ColumnDefinition,
  GridRow,
  Row,
  TableType,
  Workspace,
} from '@/lib/types';
import { DEFAULT_COLUMNS, toFieldKey } from '@/lib/types';

// ============================================================
// Context types
// ============================================================

interface WorkspaceContextValue {
  // Workspaces
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  activeTab: TableType;
  setActiveTab: (tab: TableType) => void;
  selectWorkspace: (id: string) => void;
  createWorkspace: (tableType: TableType) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;

  // Columns
  columns: ColumnDefinition[];
  addColumn: (name: string) => Promise<ColumnDefinition | null>;
  addAiColumn: (
    name: string,
    prompt: string,
    outputType: 'text' | 'number' | 'boolean',
  ) => Promise<ColumnDefinition | null>;
  updateColumnWidth: (columnId: string, width: number) => void;

  // Rows & cells
  rows: Row[];
  cellValues: CellValue[];
  gridRows: GridRow[];
  addRow: () => Promise<void>;
  upsertCellValue: (rowId: string, columnId: string, value: string) => Promise<void>;
  bulkInsertRows: (
    mappedData: Array<Record<string, string>>,
    columnMap: Record<string, string>,
  ) => Promise<void>;
  refreshData: () => Promise<void>;

  // Loading
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const widthTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TableType>('people');
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [cellValues, setCellValues] = useState<CellValue[]>([]);
  const [loading, setLoading] = useState(true);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  // ── Fetch workspaces on mount ──
  const fetchWorkspaces = useCallback(async () => {
    try {
      const data = await db.select<Workspace>('workspaces', undefined, {
        column: 'created_at',
        ascending: true,
      });
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  }, []);

  // ── Fetch columns, rows, cells for active workspace ──
  const fetchWorkspaceData = useCallback(async (workspaceId: string) => {
    setLoading(true);
    try {
      const [cols, rws] = await Promise.all([
        db.select<ColumnDefinition>('column_definitions', { workspace_id: workspaceId }),
        db.select<Row>('rows', { workspace_id: workspaceId }),
      ]);

      // Sort columns by position client-side
      cols.sort((a, b) => a.position - b.position);
      setColumns(cols);
      setRows(rws);

      // Fetch all cell values for this workspace efficiently (server-side batched)
      if (rws.length > 0) {
        const allCells = await db.getWorkspaceCells<CellValue>(workspaceId);
        setCellValues(allCells);
      } else {
        setCellValues([]);
      }
    } catch (err) {
      console.error('Failed to fetch workspace data:', err);
    }
    setLoading(false);
  }, []);

  // ── Initial load ──
  useEffect(() => {
    fetchWorkspaces().then(() => setLoading(false));
  }, [fetchWorkspaces]);

  // ── When active workspace changes, fetch its data ──
  useEffect(() => {
    if (activeWorkspaceId) {
      fetchWorkspaceData(activeWorkspaceId);
    } else {
      setColumns([]);
      setRows([]);
      setCellValues([]);
      setLoading(false);
    }
  }, [activeWorkspaceId, fetchWorkspaceData]);

  // ── Auto-select first workspace of active tab ──
  useEffect(() => {
    const tabWorkspaces = workspaces.filter((w) => w.table_type === activeTab);
    if (tabWorkspaces.length > 0 && !tabWorkspaces.find((w) => w.id === activeWorkspaceId)) {
      setActiveWorkspaceId(tabWorkspaces[0].id);
    }
    if (tabWorkspaces.length === 0) {
      setActiveWorkspaceId(null);
    }
  }, [activeTab, workspaces, activeWorkspaceId]);

  // ── Transform to AG Grid rowData ──
  const gridRows: GridRow[] = rows.map((row) => {
    const rowObj: GridRow = { _rowId: row.id };
    cellValues
      .filter((cv) => cv.row_id === row.id)
      .forEach((cv) => {
        rowObj[cv.column_id] = cv.value;
      });
    return rowObj;
  });

  // ── Workspace actions ──
  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
  }, []);

  const createWorkspace = useCallback(
    async (tableType: TableType) => {
      try {
        const ws = await db.insertOne<Workspace>('workspaces', {
          name: 'Untitled',
          table_type: tableType,
        });

        // Create default columns
        const defaultCols = DEFAULT_COLUMNS[tableType];
        const colInserts = defaultCols.map((col, i) => ({
          workspace_id: ws.id,
          name: col.name,
          field_key: col.field_key,
          position: i,
          width: 200,
          is_ai_column: false,
        }));
        await db.insert('column_definitions', colInserts);

        await fetchWorkspaces();
        setActiveTab(tableType);
        setActiveWorkspaceId(ws.id);
      } catch (err) {
        console.error('Failed to create workspace:', err);
      }
    },
    [fetchWorkspaces],
  );

  const renameWorkspace = useCallback(
    async (id: string, name: string) => {
      try {
        await db.update('workspaces', { name }, { id });
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === id ? { ...w, name } : w)),
        );
      } catch (err) {
        console.error('Failed to rename workspace:', err);
      }
    },
    [],
  );

  // ── Column actions ──
  const addColumn = useCallback(
    async (name: string): Promise<ColumnDefinition | null> => {
      if (!activeWorkspaceId) return null;
      try {
        const maxPos = columns.reduce((max, c) => Math.max(max, c.position), -1);
        const col = await db.insertOne<ColumnDefinition>('column_definitions', {
          workspace_id: activeWorkspaceId,
          name,
          field_key: toFieldKey(name),
          position: maxPos + 1,
          width: 200,
          is_ai_column: false,
        });
        setColumns((prev) => [...prev, col]);
        return col;
      } catch (err) {
        console.error('Failed to add column:', err);
        return null;
      }
    },
    [activeWorkspaceId, columns],
  );

  const addAiColumn = useCallback(
    async (
      name: string,
      prompt: string,
      outputType: 'text' | 'number' | 'boolean',
    ): Promise<ColumnDefinition | null> => {
      if (!activeWorkspaceId) return null;
      try {
        const maxPos = columns.reduce((max, c) => Math.max(max, c.position), -1);
        const col = await db.insertOne<ColumnDefinition>('column_definitions', {
          workspace_id: activeWorkspaceId,
          name,
          field_key: toFieldKey(name),
          position: maxPos + 1,
          width: 200,
          is_ai_column: true,
          ai_prompt: prompt,
          output_type: outputType,
        });
        setColumns((prev) => [...prev, col]);
        return col;
      } catch (err) {
        console.error('Failed to add AI column:', err);
        return null;
      }
    },
    [activeWorkspaceId, columns],
  );

  // Debounced column width update
  const updateColumnWidth = useCallback(
    (columnId: string, width: number) => {
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, width } : c)),
      );
      const timers = widthTimersRef.current;
      const existing = timers.get(columnId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        try {
          await db.update('column_definitions', { width }, { id: columnId });
        } catch (err) {
          console.error('Failed to update column width:', err);
        }
        timers.delete(columnId);
      }, 300);
      timers.set(columnId, timer);
    },
    [],
  );

  // ── Row actions ──
  const addRow = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      const newRow = await db.insertOne<Row>('rows', {
        workspace_id: activeWorkspaceId,
      });
      setRows((prev) => [...prev, newRow]);
    } catch (err) {
      console.error('Failed to add row:', err);
    }
  }, [activeWorkspaceId]);

  // ── Cell actions ──
  const upsertCellValue = useCallback(
    async (rowId: string, columnId: string, value: string) => {
      await db.upsert(
        'cell_values',
        { row_id: rowId, column_id: columnId, value },
        'row_id,column_id',
      );
      setCellValues((prev) => {
        const idx = prev.findIndex(
          (cv) => cv.row_id === rowId && cv.column_id === columnId,
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], value };
          return updated;
        }
        return [
          ...prev,
          { id: '', row_id: rowId, column_id: columnId, value, created_at: '' },
        ];
      });
    },
    [],
  );

  const bulkInsertRows = useCallback(
    async (
      mappedData: Array<Record<string, string>>,
      columnMap: Record<string, string>,
    ) => {
      if (!activeWorkspaceId) return;

      const batchSize = 50;
      for (let i = 0; i < mappedData.length; i += batchSize) {
        const batch = mappedData.slice(i, i + batchSize);

        // Insert rows
        const rowInserts = batch.map(() => ({ workspace_id: activeWorkspaceId }));
        const newRows = await db.insert<Row>('rows', rowInserts);
        if (!newRows || newRows.length === 0) continue;

        // Insert cell values
        const cellInserts: Array<{ row_id: string; column_id: string; value: string }> = [];
        newRows.forEach((row, idx) => {
          const csvRow = batch[idx];
          Object.entries(columnMap).forEach(([csvHeader, columnId]) => {
            const val = csvRow[csvHeader];
            if (val !== undefined && val !== '') {
              cellInserts.push({
                row_id: row.id,
                column_id: columnId,
                value: val,
              });
            }
          });
        });

        if (cellInserts.length > 0) {
          await db.insert('cell_values', cellInserts);
        }
      }

      // Refresh data
      await fetchWorkspaceData(activeWorkspaceId);
    },
    [activeWorkspaceId, fetchWorkspaceData],
  );

  const refreshData = useCallback(async () => {
    if (activeWorkspaceId) {
      await fetchWorkspaceData(activeWorkspaceId);
    }
  }, [activeWorkspaceId, fetchWorkspaceData]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        activeTab,
        setActiveTab,
        selectWorkspace,
        createWorkspace,
        renameWorkspace,
        columns,
        addColumn,
        addAiColumn,
        updateColumnWidth,
        rows,
        cellValues,
        gridRows,
        addRow,
        upsertCellValue,
        bulkInsertRows,
        refreshData,
        loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
