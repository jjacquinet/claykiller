'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import { AI_MODELS } from '@/lib/types';
import type { AiEnrichRequest, AiModel, ColumnDefinition } from '@/lib/types';

interface RunAiColumnModalProps {
  open: boolean;
  onClose: () => void;
  column: ColumnDefinition | null;
}

export default function RunAiColumnModal({ open, onClose, column }: RunAiColumnModalProps) {
  const { columns, gridRows, activeWorkspace, refreshData } = useWorkspace();
  const { toast } = useToast();

  const [rowCount, setRowCount] = useState<number>(0);
  const [model, setModel] = useState<AiModel>('sonar');
  const [skipExisting, setSkipExisting] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const totalRows = gridRows.length;

  // Reset state when modal opens
  useEffect(() => {
    if (open && column) {
      setRowCount(totalRows);
      setModel('sonar');
      setSkipExisting(true);
      setRunning(false);
      setProgress({ done: 0, total: 0 });
    }
  }, [open, column, totalRows]);

  // Determine which rows to process
  const getRowsToRun = () => {
    if (!column) return [];
    const subset = gridRows.slice(0, rowCount);
    if (skipExisting) {
      return subset.filter((row) => {
        const val = row[column.id];
        return val === undefined || val === null || val === '';
      });
    }
    return subset;
  };

  const rowsToRun = column ? getRowsToRun() : [];

  const handleRun = async () => {
    if (!column || !activeWorkspace || rowsToRun.length === 0) return;

    setRunning(true);
    const total = rowsToRun.length;
    setProgress({ done: 0, total });

    const batchSize = 5;
    let done = 0;
    let errors = 0;

    for (let i = 0; i < rowsToRun.length; i += batchSize) {
      const batch = rowsToRun.slice(i, i + batchSize);

      const promises = batch.map(async (row) => {
        // Build row context from all non-AI columns
        const rowContext: Record<string, string> = {};
        columns.forEach((col) => {
          if (!col.is_ai_column && row[col.id]) {
            rowContext[col.name] = row[col.id] as string;
          }
        });

        const payload: AiEnrichRequest = {
          columnId: column.id,
          rowId: row._rowId,
          prompt: column.ai_prompt!,
          outputType: column.output_type || 'text',
          rowContext,
          tableType: activeWorkspace.table_type,
          model,
        };

        try {
          const res = await fetch('/api/ai-enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('API error');
          return await res.json();
        } catch {
          errors++;
          return { error: 'Failed' };
        }
      });

      await Promise.all(promises);
      done += batch.length;
      setProgress({ done: Math.min(done, total), total });
    }

    await refreshData();
    setRunning(false);

    if (errors > 0) {
      toast(`Enriched ${total - errors} rows (${errors} failed)`, 'info');
    } else {
      toast(`Enriched ${total} rows`, 'success');
    }
    onClose();
  };

  const handleClose = () => {
    if (running) return;
    onClose();
  };

  if (!column) return null;

  return (
    <Modal open={open} onClose={handleClose} title={`Run AI: ${column.name}`} width="max-w-md">
      <div className="space-y-5">

        {/* Prompt preview */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Prompt</p>
          <p className="text-sm text-gray-300">{column.ai_prompt}</p>
        </div>

        {/* Row count */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Rows to run <span className="text-gray-500 font-normal">(starting from top)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={totalRows}
              value={rowCount}
              onChange={(e) => setRowCount(Number(e.target.value))}
              className="flex-1 accent-accent h-1.5 cursor-pointer"
              disabled={running}
            />
            <input
              type="number"
              min={1}
              max={totalRows}
              value={rowCount}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 1 && v <= totalRows) setRowCount(v);
              }}
              className="w-20 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 text-center focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              disabled={running}
            />
            <span className="text-xs text-gray-500">/ {totalRows}</span>
          </div>
        </div>

        {/* Model selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
          <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
            {AI_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                disabled={running}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${model === m.id
                    ? 'bg-white/10 text-gray-200 shadow-sm'
                    : 'text-gray-500 hover:text-gray-300'
                  } disabled:cursor-not-allowed`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Skip existing checkbox */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(e) => setSkipExisting(e.target.checked)}
              disabled={running}
              className="sr-only peer"
            />
            <div className="w-5 h-5 bg-white/5 border border-white/20 rounded peer-checked:bg-accent peer-checked:border-accent transition-colors flex items-center justify-center">
              {skipExisting && (
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <div>
            <span className="text-sm text-gray-300 group-hover:text-gray-200 transition-colors">
              Skip rows that already have data
            </span>
            <p className="text-xs text-gray-500">Save AI credits by not re-running completed rows</p>
          </div>
        </label>

        {/* Summary */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5 flex items-center justify-between">
          <span className="text-sm text-gray-400">Rows to process:</span>
          <span className="text-sm font-semibold text-gray-200">
            {rowsToRun.length} row{rowsToRun.length !== 1 ? 's' : ''}
            {skipExisting && rowsToRun.length < rowCount && (
              <span className="text-gray-500 font-normal ml-1">
                ({rowCount - rowsToRun.length} skipped)
              </span>
            )}
          </span>
        </div>

        {/* Progress bar */}
        {running && (
          <div className="space-y-2 bg-accent/10 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-accent font-medium">
                <span className="spinner" />
                Running…
              </span>
              <span className="text-gray-400 text-xs">
                {progress.done}/{progress.total} rows
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={handleClose}
            disabled={running}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={running || rowsToRun.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {running ? (
              <>
                <span className="spinner" />
                Running…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run {rowsToRun.length} row{rowsToRun.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
