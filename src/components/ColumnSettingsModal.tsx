'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import { isProtectedColumn } from '@/lib/types';
import type { ColumnDefinition } from '@/lib/types';

interface ColumnSettingsModalProps {
  open: boolean;
  onClose: () => void;
  column: ColumnDefinition | null;
}

export default function ColumnSettingsModal({ open, onClose, column }: ColumnSettingsModalProps) {
  const { deleteColumn, rows, activeWorkspace } = useWorkspace();
  const { toast } = useToast();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Reset when modal opens/closes
  useEffect(() => {
    if (open) {
      setShowDeleteConfirm(false);
      setConfirmText('');
      setDeleting(false);
    }
  }, [open]);

  const canDelete = column ? confirmText === column.name : false;

  const handleDelete = async () => {
    if (!column || !canDelete) return;
    setDeleting(true);
    try {
      await deleteColumn(column.id);
      toast(`Column "${column.name}" deleted`, 'success');
      onClose();
    } catch {
      toast('Failed to delete column', 'error');
      setDeleting(false);
    }
  };

  const isProtected = column && activeWorkspace
    ? isProtectedColumn(column.field_key, activeWorkspace.table_type)
    : false;

  if (!column) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Column Settings: ${column.name}`} width="max-w-md">
      <div className="space-y-5">
        {/* Column info */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">{column.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {column.is_ai_column ? 'AI Column' : 'Data Column'} &middot; {rows.length} rows
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isProtected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Protected
                </span>
              )}
              {column.is_ai_column && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  AI
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className={`border rounded-lg overflow-hidden ${isProtected ? 'border-white/10' : 'border-red-500/20'}`}>
          <div className={`px-4 py-3 border-b ${isProtected ? 'bg-white/[0.02] border-white/10' : 'bg-red-500/5 border-red-500/20'}`}>
            <h3 className={`text-sm font-semibold ${isProtected ? 'text-gray-400' : 'text-red-400'}`}>
              {isProtected ? 'Delete Column' : 'Danger Zone'}
            </h3>
          </div>

          <div className="p-4">
            {isProtected ? (
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-400">This column cannot be deleted</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    &ldquo;{column.name}&rdquo; is a default column for {activeWorkspace?.table_type} tables and is protected from deletion.
                  </p>
                </div>
              </div>
            ) : !showDeleteConfirm ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Delete this column</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Permanently remove this column and all its data
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 text-sm font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                >
                  Delete Column
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Warning */}
                <div className="flex gap-2 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-red-300">
                      This will permanently delete the column &ldquo;{column.name}&rdquo;
                    </p>
                    <p className="text-xs text-red-400/70 mt-1">
                      All data for all {rows.length} rows in this column will be permanently removed. This action cannot be undone.
                    </p>
                  </div>
                </div>

                {/* Type to confirm */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Type <span className="font-semibold text-gray-200">{column.name}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={column.name}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50"
                    autoFocus
                    disabled={deleting}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setConfirmText('');
                    }}
                    disabled={deleting}
                    className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={!canDelete || deleting}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {deleting ? (
                      <>
                        <span className="spinner" />
                        Deleting…
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Column Permanently
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
