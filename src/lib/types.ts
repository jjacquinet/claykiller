// ============================================================
// Database types matching the Supabase schema
// ============================================================

export type TableType = 'people' | 'companies';
export type OutputType = 'text' | 'number' | 'boolean';

export interface Workspace {
  id: string;
  name: string;
  table_type: TableType;
  created_at: string;
  user_id: string | null;
}

export interface ColumnDefinition {
  id: string;
  workspace_id: string;
  name: string;
  position: number;
  width: number;
  is_ai_column: boolean;
  ai_prompt: string | null;
  output_type: OutputType | null;
  created_at: string;
}

export interface Row {
  id: string;
  workspace_id: string;
  created_at: string;
}

export interface CellValue {
  id: string;
  row_id: string;
  column_id: string;
  value: string;
  created_at: string;
}

// ============================================================
// Application types
// ============================================================

/** Flat row object for AG Grid rowData */
export interface GridRow {
  _rowId: string;
  [columnId: string]: string | undefined;
}

/** AI enrichment request payload */
export interface AiEnrichRequest {
  columnId: string;
  rowId: string;
  prompt: string;
  outputType: OutputType;
  rowContext: Record<string, string>;
  tableType: TableType;
}

/** AI enrichment response */
export interface AiEnrichResponse {
  value: string;
  error?: string;
}

/** Default columns per table type */
export const DEFAULT_COLUMNS: Record<TableType, string[]> = {
  people: ['First Name', 'Last Name', 'Email', 'Company', 'Title', 'LinkedIn URL'],
  companies: ['Company Name', 'Website', 'Industry', 'Employee Count', 'Location', 'Description'],
};
