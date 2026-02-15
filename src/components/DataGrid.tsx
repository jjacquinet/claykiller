'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from '@ag-grid-community/react';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import type {
  CellEditRequestEvent,
  ColDef,
  ColumnResizedEvent,
  ICellRendererParams,
  IHeaderParams,
  SelectionChangedEvent,
} from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import type { GridRow } from '@/lib/types';

// Register the module once
ModuleRegistry.registerModules([ClientSideRowModelModule]);

// ── Undo stack entry ──
interface UndoEntry {
  rowId: string;
  columnId: string;
  oldValue: string;
  newValue: string;
}

// ── Boolean cell renderer ──
function BooleanRenderer(params: ICellRendererParams) {
  const val = String(params.value ?? '').toLowerCase().trim();
  if (val === 'true') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        True
      </span>
    );
  }
  if (val === 'false') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        False
      </span>
    );
  }
  return <span className="text-gray-400">{params.value ?? ''}</span>;
}

// ── Custom column header with sort indicator + run button (AI) + settings button ──
function ColumnHeader(
  params: IHeaderParams & {
    onOpenSettings: (colId: string) => void;
    onRunAiColumn?: (colId: string) => void;
  },
) {
  const colDef = params.column.getColDef();
  const isAi = colDef.headerComponentParams?.isAi;
  const colId = params.column.getColId();
  const [sortState, setSortState] = useState<'asc' | 'desc' | null>(null);

  const onSortClicked = (e: React.MouseEvent) => {
    const next = sortState === null ? 'asc' : sortState === 'asc' ? 'desc' : null;
    setSortState(next);
    params.setSort(next, e.shiftKey);
  };

  const onRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    params.onRunAiColumn?.(colId);
  };

  const onSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    params.onOpenSettings(colId);
  };

  return (
    <div className="flex items-center w-full group cursor-pointer select-none" onClick={onSortClicked}>
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
        {isAi && (
          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        )}
        <span className="truncate">{params.displayName}</span>
        {sortState === 'asc' && <span className="text-gray-400 ml-0.5">▲</span>}
        {sortState === 'desc' && <span className="text-gray-400 ml-0.5">▼</span>}
      </div>
      {/* Run button for AI columns — always visible with accent style */}
      {isAi && (
        <button
          onClick={onRun}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-all flex-shrink-0 ml-1 text-[11px] font-semibold"
          title="Run AI enrichment"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          Run
        </button>
      )}
      {/* Settings gear icon */}
      <button
        onClick={onSettings}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-all flex-shrink-0 ml-0.5"
        title="Column settings"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  );
}

// ── Enriching cell (spinner) renderer ──
function SpinnerRenderer() {
  return (
    <span className="flex items-center gap-2 text-gray-400 text-xs">
      <span className="spinner" />
      Enriching…
    </span>
  );
}

interface DataGridProps {
  onRunAiColumn?: (columnId: string, selectedRowIds: string[]) => void;
  onOpenColumnSettings?: (columnId: string) => void;
  onSelectedRowsChanged?: (rowIds: string[]) => void;
}

export default function DataGrid({ onRunAiColumn, onOpenColumnSettings, onSelectedRowsChanged }: DataGridProps) {
  const {
    columns,
    gridRows,
    upsertCellValue,
    updateColumnWidth,
    deleteRows,
    activeWorkspace,
    loading,
  } = useWorkspace();
  const { toast } = useToast();
  const gridRef = useRef<AgGridReact>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const selectedRowIdsRef = useRef<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // ── Custom undo/redo stacks ──
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);

  const performUndo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) {
      toast('Nothing to undo', 'info');
      return;
    }
    try {
      await upsertCellValue(entry.rowId, entry.columnId, entry.oldValue);
      redoStackRef.current.push(entry);
      toast('Undone', 'success');
    } catch {
      // Push it back if undo failed
      undoStackRef.current.push(entry);
      toast('Undo failed', 'error');
    }
  }, [upsertCellValue, toast]);

  const performRedo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) {
      toast('Nothing to redo', 'info');
      return;
    }
    try {
      await upsertCellValue(entry.rowId, entry.columnId, entry.newValue);
      undoStackRef.current.push(entry);
      toast('Redone', 'success');
    } catch {
      redoStackRef.current.push(entry);
      toast('Redo failed', 'error');
    }
  }, [upsertCellValue, toast]);

  // ── Keyboard shortcut for Cmd+Z / Cmd+Shift+Z ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || e.key.toLowerCase() !== 'z') return;

      // Don't intercept if user is actively editing a cell (let AG Grid handle inline editing)
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

      e.preventDefault();
      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performUndo, performRedo]);

  // ── Delete selected rows handler ──
  const handleDeleteSelectedRows = useCallback(async () => {
    if (selectedRowIds.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedRowIds.length} selected row${selectedRowIds.length > 1 ? 's' : ''}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteRows(selectedRowIds);
      setSelectedRowIds([]);
      toast(`${selectedRowIds.length} row${selectedRowIds.length > 1 ? 's' : ''} deleted`, 'success');
    } catch {
      toast('Failed to delete rows', 'error');
    }
    setDeleting(false);
  }, [selectedRowIds, deleteRows, toast]);

  // Stable wrapper that captures current selection at call time
  const handleRunAiColumnWithSelection = useCallback(
    (colId: string) => {
      onRunAiColumn?.(colId, selectedRowIdsRef.current);
    },
    [onRunAiColumn],
  );

  // ── Column Definitions ──
  const columnDefs: ColDef[] = useMemo(() => {
    const dataCols: ColDef[] = columns.map((col) => {
      const def: ColDef = {
        field: col.id,
        headerName: col.name,
        width: col.width || 200,
        editable: true,
        sortable: true,
        resizable: true,
        minWidth: 100,
        flex: 0,
        headerComponent: ColumnHeader,
        headerComponentParams: {
          isAi: col.is_ai_column,
          onOpenSettings: onOpenColumnSettings,
          onRunAiColumn: handleRunAiColumnWithSelection,
        },
      };

      // Boolean output type for AI columns
      if (col.is_ai_column && col.output_type === 'boolean') {
        def.cellRenderer = BooleanRenderer;
      }

      return def;
    });

    // Prepend checkbox selection column
    const checkboxCol: ColDef = {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      maxWidth: 50,
      minWidth: 50,
      resizable: false,
      sortable: false,
      editable: false,
      suppressMovable: true,
      lockPosition: 'left',
      headerName: '',
    };

    return [checkboxCol, ...dataCols];
  }, [columns, onOpenColumnSettings, handleRunAiColumnWithSelection]);

  // ── Row Data ──
  const rowData: GridRow[] = useMemo(() => gridRows, [gridRows]);

  // ── Selection changed handler ──
  const handleSelectionChanged = useCallback(
    (event: SelectionChangedEvent) => {
      const selected = event.api.getSelectedRows() as GridRow[];
      const ids = selected.map((r) => r._rowId);
      setSelectedRowIds(ids);
      selectedRowIdsRef.current = ids;
      onSelectedRowsChanged?.(ids);
    },
    [onSelectedRowsChanged],
  );

  // ── Cell edit request handler (readOnlyEdit mode) ──
  // AG Grid does NOT auto-apply the edit — we confirm first, then update our data source
  const handleCellEditRequest = useCallback(
    async (event: CellEditRequestEvent) => {
      const rowId = event.data._rowId as string;
      const columnId = event.colDef.field as string;
      const oldValue = String(event.oldValue ?? '');
      const newValue = String(event.newValue ?? '');
      const colName = event.colDef.headerName ?? 'cell';

      // No change — skip
      if (oldValue === newValue) return;

      const confirmed = window.confirm(
        `Update "${colName}" from "${oldValue || '(empty)'}" to "${newValue || '(empty)'}"?`,
      );
      if (!confirmed) return;

      try {
        await upsertCellValue(rowId, columnId, newValue);
        // Push to undo stack, clear redo stack
        undoStackRef.current.push({ rowId, columnId, oldValue, newValue });
        redoStackRef.current = [];
        toast(`Updated "${colName}"`, 'success', {
          label: 'Undo',
          onClick: () => performUndo(),
        });
      } catch {
        toast('Failed to save cell', 'error');
      }
    },
    [upsertCellValue, toast, performUndo],
  );

  // ── Column resize handler ──
  const handleColumnResized = useCallback(
    (event: ColumnResizedEvent) => {
      if (!event.finished || !event.column) return;
      const colId = event.column.getColId();
      const newWidth = event.column.getActualWidth();
      updateColumnWidth(colId, newWidth);
    },
    [updateColumnWidth],
  );

  if (!activeWorkspace) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-200 mb-1">No table selected</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          Create a new table from the sidebar to get started.
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="h-full p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-11 bg-white/5 rounded-lg" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/[0.02] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (gridRows.length === 0 && columns.length > 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-200 mb-1">No data yet</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          Upload a CSV or add rows to get started with your {activeWorkspace.table_type} table.
        </p>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: '100%', height: '100%' }}>
      <div className="ag-theme-quartz-dark" style={{ width: '100%', height: '100%' }}>
        <AgGridReact
          ref={gridRef}
          columnDefs={columnDefs}
          rowData={rowData}
          defaultColDef={{
            resizable: true,
            editable: true,
            sortable: true,
            minWidth: 100,
            flex: 0,
          }}
          rowSelection="multiple"
          readOnlyEdit={true}
          onCellEditRequest={handleCellEditRequest}
          onColumnResized={handleColumnResized}
          onSelectionChanged={handleSelectionChanged}
          rowHeight={40}
          headerHeight={44}
          animateRows={true}
          getRowId={(params) => params.data._rowId}
          suppressClickEdit={false}
          suppressRowClickSelection={true}
        />
      </div>

      {/* Floating delete bar when rows are selected */}
      {selectedRowIds.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-2.5 shadow-2xl shadow-black/50">
          <span className="text-sm text-gray-300">
            {selectedRowIds.length} row{selectedRowIds.length > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleDeleteSelectedRows}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
          >
            {deleting ? (
              <span className="spinner" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// Export renderer for use in AI enrichment
export { SpinnerRenderer };
