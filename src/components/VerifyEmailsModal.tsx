'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import type { ColumnDefinition, GridRow } from '@/lib/types';

type RunMode = 'selected' | 'top_n';

interface VerifyEmailsModalProps {
  open: boolean;
  onClose: () => void;
  selectedRowIds?: string[];
}

export default function VerifyEmailsModal({ open, onClose, selectedRowIds = [] }: VerifyEmailsModalProps) {
  const { columns, gridRows, activeWorkspace, refreshData, addColumn } = useWorkspace();
  const { toast } = useToast();

  const hasSelection = selectedRowIds.length > 0;
  const [runMode, setRunMode] = useState<RunMode>('top_n');
  const [rowCount, setRowCount] = useState<number>(0);
  const [skipVerified, setSkipVerified] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const totalRows = gridRows.length;

  // Find the Email column and Email Status column
  const emailCol = columns.find((c) => c.field_key === 'email');
  const emailStatusCol = columns.find((c) => c.field_key === 'email_status');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setRowCount(totalRows);
      setSkipVerified(true);
      setRunning(false);
      setProgress({ done: 0, total: 0 });
      setRunMode(selectedRowIds.length > 0 ? 'selected' : 'top_n');
    }
  }, [open, totalRows, selectedRowIds.length]);

  // Determine which rows to process
  const getRowsToVerify = (): GridRow[] => {
    if (!emailCol) return [];

    let pool: GridRow[];
    if (runMode === 'selected') {
      const idSet = new Set(selectedRowIds);
      pool = gridRows.filter((row) => idSet.has(row._rowId));
    } else {
      pool = gridRows.slice(0, rowCount);
    }

    // Only include rows that have an email address
    pool = pool.filter((row) => {
      const email = row[emailCol.id];
      return email && email.trim() !== '';
    });

    if (skipVerified && emailStatusCol) {
      pool = pool.filter((row) => {
        const status = row[emailStatusCol.id];
        return status === undefined || status === null || status === '';
      });
    }

    return pool;
  };

  const rowsToVerify = getRowsToVerify();
  const poolSize = runMode === 'selected' ? selectedRowIds.length : rowCount;

  const handleVerify = async () => {
    if (!activeWorkspace || !emailCol || rowsToVerify.length === 0) return;

    setRunning(true);

    // Ensure "Email Status" column exists — create it if not
    let statusCol: ColumnDefinition | null | undefined = emailStatusCol;
    if (!statusCol) {
      statusCol = await addColumn('Email Status');
      if (!statusCol) {
        toast('Failed to create Email Status column', 'error');
        setRunning(false);
        return;
      }
    }

    const total = rowsToVerify.length;
    setProgress({ done: 0, total });

    const batchSize = 5;
    let done = 0;
    let errors = 0;

    for (let i = 0; i < rowsToVerify.length; i += batchSize) {
      const batch = rowsToVerify.slice(i, i + batchSize);

      const promises = batch.map(async (row) => {
        const email = row[emailCol.id] ?? '';
        try {
          const res = await fetch('/api/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              rowId: row._rowId,
              columnId: statusCol!.id,
            }),
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
      toast(`Verified ${total - errors} emails (${errors} failed)`, 'info');
    } else {
      toast(`Verified ${total} emails`, 'success');
    }
    onClose();
  };

  const handleClose = () => {
    if (running) return;
    onClose();
  };

  const isPeopleTable = activeWorkspace?.table_type === 'people';

  return (
    <Modal open={open} onClose={handleClose} title="Verify Emails" width="max-w-md">
      <div className="space-y-5">
        {!isPeopleTable ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">Email verification is only available for People tables.</p>
          </div>
        ) : !emailCol ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">No &ldquo;Email&rdquo; column found. Please add one first.</p>
          </div>
        ) : (
          <>
            {/* Info */}
            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">ZeroBounce Verification</p>
              <p className="text-sm text-gray-300">
                Validates each email address and writes the result (valid, invalid, catch-all, etc.) to the &ldquo;Email Status&rdquo; column.
              </p>
            </div>

            {/* Run mode: selected rows vs top N */}
            {hasSelection && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Verify</label>
                <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                  <button
                    onClick={() => setRunMode('selected')}
                    disabled={running}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                      ${runMode === 'selected'
                        ? 'bg-white/10 text-gray-200 shadow-sm'
                        : 'text-gray-500 hover:text-gray-300'
                      } disabled:cursor-not-allowed`}
                  >
                    Selected rows ({selectedRowIds.length})
                  </button>
                  <button
                    onClick={() => setRunMode('top_n')}
                    disabled={running}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                      ${runMode === 'top_n'
                        ? 'bg-white/10 text-gray-200 shadow-sm'
                        : 'text-gray-500 hover:text-gray-300'
                      } disabled:cursor-not-allowed`}
                  >
                    Rows from top
                  </button>
                </div>
              </div>
            )}

            {/* Row count slider */}
            {runMode === 'top_n' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Rows to verify <span className="text-gray-500 font-normal">(starting from top)</span>
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
            )}

            {/* Skip verified checkbox */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={skipVerified}
                  onChange={(e) => setSkipVerified(e.target.checked)}
                  disabled={running}
                  className="sr-only peer"
                />
                <div className="w-5 h-5 bg-white/5 border border-white/20 rounded peer-checked:bg-accent peer-checked:border-accent transition-colors flex items-center justify-center">
                  {skipVerified && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <span className="text-sm text-gray-300 group-hover:text-gray-200 transition-colors">
                  Skip already verified emails
                </span>
                <p className="text-xs text-gray-500">Save credits by not re-verifying emails that already have a status</p>
              </div>
            </label>

            {/* Summary */}
            <div className="bg-white/5 rounded-lg p-3 border border-white/5 flex items-center justify-between">
              <span className="text-sm text-gray-400">Emails to verify:</span>
              <span className="text-sm font-semibold text-gray-200">
                {rowsToVerify.length} email{rowsToVerify.length !== 1 ? 's' : ''}
                {skipVerified && rowsToVerify.length < poolSize && (
                  <span className="text-gray-500 font-normal ml-1">
                    ({poolSize - rowsToVerify.length} skipped)
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
                    Verifying…
                  </span>
                  <span className="text-gray-400 text-xs">
                    {progress.done}/{progress.total} emails
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
                onClick={handleVerify}
                disabled={running || rowsToVerify.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {running ? (
                  <>
                    <span className="spinner" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Verify {rowsToVerify.length} email{rowsToVerify.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
