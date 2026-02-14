'use client';

import { useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from '@ag-grid-community/react';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import type {
  CellValueChangedEvent,
  ColDef,
  ColumnResizedEvent,
  ICellRendererParams,
} from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import type { GridRow } from '@/lib/types';

// Register the module once
ModuleRegistry.registerModules([ClientSideRowModelModule]);

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

// ── AI Column header with sparkle icon ──
function AiHeaderRenderer(props: { displayName: string }) {
  return (
    <span className="flex items-center gap-1">
      <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
      {props.displayName}
    </span>
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

export default function DataGrid() {
  const { columns, gridRows, upsertCellValue, updateColumnWidth, activeWorkspace, loading } =
    useWorkspace();
  const { toast } = useToast();
  const gridRef = useRef<AgGridReact>(null);

  // ── Column Definitions ──
  const columnDefs: ColDef[] = useMemo(() => {
    return columns.map((col) => {
      const def: ColDef = {
        field: col.id,
        headerName: col.name,
        width: col.width || 200,
        editable: true,
        sortable: true,
        resizable: true,
        minWidth: 100,
        flex: 0,
      };

      // AI column header with sparkle
      if (col.is_ai_column) {
        def.headerComponent = AiHeaderRenderer;
      }

      // Boolean output type for AI columns
      if (col.is_ai_column && col.output_type === 'boolean') {
        def.cellRenderer = BooleanRenderer;
      }

      return def;
    });
  }, [columns]);

  // ── Row Data ──
  const rowData: GridRow[] = useMemo(() => gridRows, [gridRows]);

  // ── Cell edit handler ──
  const handleCellValueChanged = useCallback(
    async (event: CellValueChangedEvent) => {
      const rowId = event.data._rowId as string;
      const columnId = event.colDef.field as string;
      const newValue = event.newValue ?? '';

      try {
        await upsertCellValue(rowId, columnId, String(newValue));
      } catch {
        // Revert on failure
        event.node.setDataValue(columnId, event.oldValue);
        toast('Failed to save cell', 'error');
      }
    },
    [upsertCellValue, toast],
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
        <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-800 mb-1">No table selected</h3>
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
          <div className="h-11 bg-gray-100 rounded-lg" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (gridRows.length === 0 && columns.length > 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-800 mb-1">No data yet</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          Upload a CSV or add rows to get started with your {activeWorkspace.table_type} table.
        </p>
      </div>
    );
  }

  return (
    <div className="ag-theme-quartz" style={{ width: '100%', height: '100%' }}>
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
        onCellValueChanged={handleCellValueChanged}
        onColumnResized={handleColumnResized}
        rowHeight={40}
        headerHeight={44}
        animateRows={true}
        getRowId={(params) => params.data._rowId}
        suppressClickEdit={false}
      />
    </div>
  );
}

// Export renderer for use in AI enrichment
export { SpinnerRenderer };
