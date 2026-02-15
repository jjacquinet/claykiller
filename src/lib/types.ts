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
  field_key: string;
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
  position: number;
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

/** Available AI models */
export type AiModel = 'sonar' | 'sonar-pro' | 'claude-sonnet';

export const AI_MODELS: { id: AiModel; label: string }[] = [
  { id: 'sonar', label: 'Perplexity Sonar' },
  { id: 'sonar-pro', label: 'Perplexity Sonar Pro' },
  { id: 'claude-sonnet', label: 'Claude Sonnet' },
];

/** AI enrichment request payload */
export interface AiEnrichRequest {
  columnId: string;
  rowId: string;
  prompt: string;
  outputType: OutputType;
  rowContext: Record<string, string>;
  tableType: TableType;
  model?: AiModel;
}

/** AI enrichment response */
export interface AiEnrichResponse {
  value: string;
  error?: string;
}

/** Helper to generate a snake_case field_key from a column name */
export function toFieldKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Default columns per table type: [display name, field_key] */
export interface DefaultColumn {
  name: string;
  field_key: string;
}

export const DEFAULT_COLUMNS: Record<TableType, DefaultColumn[]> = {
  people: [
    { name: 'First Name', field_key: 'first_name' },
    { name: 'Last Name', field_key: 'last_name' },
    { name: 'Email', field_key: 'email' },
    { name: 'Email Status', field_key: 'email_status' },
    { name: 'LinkedIn URL', field_key: 'linkedin_url' },
    { name: 'Company Name', field_key: 'company_name' },
    { name: 'Title', field_key: 'title' },
    { name: 'Company Website', field_key: 'company_website' },
  ],
  companies: [
    { name: 'Company Name', field_key: 'company_name' },
    { name: 'Website', field_key: 'website' },
    { name: 'Location', field_key: 'location' },
    { name: 'Headcount (# of Employees)', field_key: 'headcount' },
    { name: 'Description', field_key: 'description' },
    { name: 'Phone', field_key: 'phone' },
    { name: 'LinkedIn URL', field_key: 'linkedin_url' },
  ],
};

/** Check if a column is a protected default column that cannot be deleted */
export function isProtectedColumn(fieldKey: string, tableType: TableType): boolean {
  return DEFAULT_COLUMNS[tableType].some((col) => col.field_key === fieldKey);
}
