'use client';

import { useCallback, useRef, useState } from 'react';
import Papa from 'papaparse';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import { createClient } from '@/lib/supabase/client';
import type { ColumnDefinition } from '@/lib/types';

interface CsvUploadModalProps {
  open: boolean;
  onClose: () => void;
}

type MappingValue = string | '__create__' | '__skip__';

interface ColumnMapping {
  csvHeader: string;
  target: MappingValue;
}

export default function CsvUploadModal({ open, onClose }: CsvUploadModalProps) {
  const { columns, activeWorkspace, refreshData, addColumn } = useWorkspace();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'mapping'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<Array<Record<string, string>>>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Fuzzy match helper ──
  const findBestMatch = useCallback(
    (csvHeader: string): MappingValue => {
      const normalized = csvHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const col of columns) {
        const colNorm = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (colNorm === normalized) return col.id;
        // Partial match
        if (colNorm.includes(normalized) || normalized.includes(colNorm)) return col.id;
      }
      return '__create__';
    },
    [columns],
  );

  // ── Handle file drop / select ──
  const handleFile = useCallback(
    (file: File) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.meta.fields || results.meta.fields.length === 0) {
            toast('Could not detect CSV columns', 'error');
            return;
          }
          const headers = results.meta.fields;
          const data = results.data;
          setCsvHeaders(headers);
          setCsvData(data);

          // Auto-map headers
          const autoMappings: ColumnMapping[] = headers.map((h) => ({
            csvHeader: h,
            target: findBestMatch(h),
          }));
          setMappings(autoMappings);
          setValidationError(null);
          setStep('mapping');
        },
        error: () => {
          toast('Failed to parse CSV file', 'error');
        },
      });
    },
    [findBestMatch, toast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const updateMapping = (index: number, value: MappingValue) => {
    setMappings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], target: value };
      return updated;
    });
    setValidationError(null);
  };

  // ── Validate companies table ──
  const validate = (): boolean => {
    if (activeWorkspace?.table_type !== 'companies') return true;

    const mappedColumnIds = mappings
      .filter((m) => m.target !== '__skip__')
      .map((m) => m.target);

    const hasCompanyName = columns.some(
      (c) => mappedColumnIds.includes(c.id) && c.name.toLowerCase().includes('company name'),
    );
    const hasWebsite = columns.some(
      (c) => mappedColumnIds.includes(c.id) && c.name.toLowerCase().includes('website'),
    );

    // Also check create-new columns
    const createMappings = mappings.filter((m) => m.target === '__create__');
    const hasNewCompanyName = createMappings.some((m) =>
      m.csvHeader.toLowerCase().includes('company name'),
    );
    const hasNewWebsite = createMappings.some((m) =>
      m.csvHeader.toLowerCase().includes('website'),
    );

    if (!hasCompanyName && !hasWebsite && !hasNewCompanyName && !hasNewWebsite) {
      setValidationError(
        'Companies table requires at least "Company Name" or "Website" to be mapped.',
      );
      return false;
    }
    return true;
  };

  // ── Import data ──
  const handleImport = async () => {
    if (!validate()) return;

    setUploading(true);
    setProgress(0);

    const supabase = createClient();

    try {
      // 1. Create new columns for __create__ mappings
      const columnMap: Record<string, string> = {}; // csvHeader → columnId
      const activeMappings = mappings.filter((m) => m.target !== '__skip__');

      for (const mapping of activeMappings) {
        if (mapping.target === '__create__') {
          const newCol = await addColumn(mapping.csvHeader);
          if (newCol) {
            columnMap[mapping.csvHeader] = newCol.id;
          }
        } else {
          columnMap[mapping.csvHeader] = mapping.target;
        }
      }

      // 2. Batch insert rows + cells
      const batchSize = 50;
      const total = csvData.length;

      for (let i = 0; i < total; i += batchSize) {
        const batch = csvData.slice(i, i + batchSize);

        // Insert rows
        const rowInserts = batch.map(() => ({
          workspace_id: activeWorkspace!.id,
        }));
        const { data: newRows, error: rowErr } = await supabase
          .from('rows')
          .insert(rowInserts)
          .select();

        if (rowErr || !newRows) {
          toast('Error inserting rows', 'error');
          break;
        }

        // Insert cell values
        const cellInserts: Array<{
          row_id: string;
          column_id: string;
          value: string;
        }> = [];

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

        setProgress(Math.min(i + batchSize, total));
      }

      await refreshData();
      toast(`Imported ${csvData.length} rows`, 'success');
      handleClose();
    } catch (err) {
      toast('Import failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvData([]);
    setMappings([]);
    setProgress(0);
    setUploading(false);
    setValidationError(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Upload CSV" width="max-w-2xl">
      {step === 'upload' ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center cursor-pointer
            hover:border-accent/50 hover:bg-accent/5 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <svg
            className="w-12 h-12 text-gray-300 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          <p className="text-sm font-medium text-gray-700 mb-1">
            Drop your CSV file here, or click to browse
          </p>
          <p className="text-xs text-gray-400">Supports .csv files with headers</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Row count info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Detected <strong className="text-gray-800">{csvHeaders.length}</strong> columns,{' '}
              <strong className="text-gray-800">{csvData.length}</strong> rows
            </span>
          </div>

          {/* Column Mapper */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-2 gap-0 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-border">
              <span>CSV Column</span>
              <span>Map To</span>
            </div>
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {mappings.map((mapping, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-4 px-4 py-2.5 items-center">
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {mapping.csvHeader}
                  </span>
                  <select
                    value={mapping.target}
                    onChange={(e) => updateMapping(idx, e.target.value)}
                    className="text-sm border border-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    <optgroup label="Existing Columns">
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                    </optgroup>
                    <option value="__create__">— Create as new column —</option>
                    <option value="__skip__">— Skip this column —</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {validationError}
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Importing…</span>
                <span>
                  {progress}/{csvData.length} rows
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${(progress / csvData.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleClose}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? `Importing… (${progress}/${csvData.length})` : `Import ${csvData.length} Rows`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
