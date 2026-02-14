'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type {
  CellValue,
  ColumnDefinition,
  GridRow,
  Row,
  TableType,
  Workspace,
} from '@/lib/types';
import { DEFAULT_COLUMNS } from '@/lib/types';

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
  const supabase = useMemo(() => createClient(), []);
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
    const { data } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setWorkspaces(data as Workspace[]);
  }, [supabase]);

  // ── Fetch columns, rows, cells for active workspace ──
  const fetchWorkspaceData = useCallback(
    async (workspaceId: string) => {
      setLoading(true);
      const [colRes, rowRes] = await Promise.all([
        supabase
          .from('column_definitions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('position', { ascending: true }),
        supabase
          .from('rows')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: true }),
      ]);

      const cols = (colRes.data ?? []) as ColumnDefinition[];
      const rws = (rowRes.data ?? []) as Row[];
      setColumns(cols);
      setRows(rws);

      // Fetch all cell values for these rows
      if (rws.length > 0) {
        const rowIds = rws.map((r) => r.id);
        // Supabase `in` filter has a limit, batch if needed
        const batchSize = 500;
        const allCells: CellValue[] = [];
        for (let i = 0; i < rowIds.length; i += batchSize) {
          const batch = rowIds.slice(i, i + batchSize);
          const { data: cellData } = await supabase
            .from('cell_values')
            .select('*')
            .in('row_id', batch);
          if (cellData) allCells.push(...(cellData as CellValue[]));
        }
        setCellValues(allCells);
      } else {
        setCellValues([]);
      }

      setLoading(false);
    },
    [supabase],
  );

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
      const { data, error } = await supabase
        .from('workspaces')
        .insert({ name: 'Untitled', table_type: tableType })
        .select()
        .single();
      if (error || !data) return;

      const ws = data as Workspace;

      // Create default columns
      const defaultCols = DEFAULT_COLUMNS[tableType];
      const colInserts = defaultCols.map((name, i) => ({
        workspace_id: ws.id,
        name,
        position: i,
        width: 200,
        is_ai_column: false,
      }));
      await supabase.from('column_definitions').insert(colInserts);

      await fetchWorkspaces();
      setActiveTab(tableType);
      setActiveWorkspaceId(ws.id);
    },
    [supabase, fetchWorkspaces],
  );

  const renameWorkspace = useCallback(
    async (id: string, name: string) => {
      await supabase.from('workspaces').update({ name }).eq('id', id);
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, name } : w)),
      );
    },
    [supabase],
  );

  // ── Column actions ──
  const addColumn = useCallback(
    async (name: string): Promise<ColumnDefinition | null> => {
      if (!activeWorkspaceId) return null;
      const maxPos = columns.reduce((max, c) => Math.max(max, c.position), -1);
      const { data, error } = await supabase
        .from('column_definitions')
        .insert({
          workspace_id: activeWorkspaceId,
          name,
          position: maxPos + 1,
          width: 200,
          is_ai_column: false,
        })
        .select()
        .single();
      if (error || !data) return null;
      const col = data as ColumnDefinition;
      setColumns((prev) => [...prev, col]);
      return col;
    },
    [activeWorkspaceId, columns, supabase],
  );

  const addAiColumn = useCallback(
    async (
      name: string,
      prompt: string,
      outputType: 'text' | 'number' | 'boolean',
    ): Promise<ColumnDefinition | null> => {
      if (!activeWorkspaceId) return null;
      const maxPos = columns.reduce((max, c) => Math.max(max, c.position), -1);
      const { data, error } = await supabase
        .from('column_definitions')
        .insert({
          workspace_id: activeWorkspaceId,
          name,
          position: maxPos + 1,
          width: 200,
          is_ai_column: true,
          ai_prompt: prompt,
          output_type: outputType,
        })
        .select()
        .single();
      if (error || !data) return null;
      const col = data as ColumnDefinition;
      setColumns((prev) => [...prev, col]);
      return col;
    },
    [activeWorkspaceId, columns, supabase],
  );

  // Debounced column width update
  const updateColumnWidth = useCallback(
    (columnId: string, width: number) => {
      // Update local state immediately
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, width } : c)),
      );
      // Debounce the Supabase write
      const timers = widthTimersRef.current;
      const existing = timers.get(columnId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        await supabase
          .from('column_definitions')
          .update({ width })
          .eq('id', columnId);
        timers.delete(columnId);
      }, 300);
      timers.set(columnId, timer);
    },
    [supabase],
  );

  // ── Row actions ──
  const addRow = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const { data, error } = await supabase
      .from('rows')
      .insert({ workspace_id: activeWorkspaceId })
      .select()
      .single();
    if (error || !data) return;
    const newRow = data as Row;
    setRows((prev) => [...prev, newRow]);
  }, [activeWorkspaceId, supabase]);

  // ── Cell actions ──
  const upsertCellValue = useCallback(
    async (rowId: string, columnId: string, value: string) => {
      const { error } = await supabase.from('cell_values').upsert(
        { row_id: rowId, column_id: columnId, value },
        { onConflict: 'row_id,column_id' },
      );
      if (error) throw error;
      // Update local state
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
    [supabase],
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
        const { data: newRows, error: rowErr } = await supabase
          .from('rows')
          .insert(rowInserts)
          .select();
        if (rowErr || !newRows) continue;

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
          await supabase.from('cell_values').insert(cellInserts);
        }
      }

      // Refresh data
      await fetchWorkspaceData(activeWorkspaceId);
    },
    [activeWorkspaceId, supabase, fetchWorkspaceData],
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
