'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import { db } from '@/lib/db';
import type { ColumnDefinition, Row, TableType } from '@/lib/types';

type Step = 'choose' | 'apollo_list' | 'apollo_mapping' | 'importing';

type MappingValue = string | '__create__' | '__skip__';

interface ApolloList {
  id: string;
  name: string;
  count: number;
}

interface ApolloContact {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  linkedin_url: string;
  company_name: string;
  company_website: string;
  phone: string;
  location: string;
}

interface ColumnMapping {
  apolloField: string;
  apolloLabel: string;
  target: MappingValue;
}

// Human-friendly labels for Apollo fields
const APOLLO_FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  title: 'Title',
  linkedin_url: 'LinkedIn URL',
  company_name: 'Company Name',
  company_website: 'Company Website',
  phone: 'Phone',
  location: 'Location',
};

interface NewTableModalProps {
  open: boolean;
  onClose: () => void;
  tableType: TableType;
  onCsvUpload: () => void; // triggers the CSV upload flow after workspace is created
}

export default function NewTableModal({ open, onClose, tableType, onCsvUpload }: NewTableModalProps) {
  const { createWorkspace, columns, activeWorkspace, addColumn, refreshData } = useWorkspace();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('choose');

  // Apollo list picker state
  const [lists, setLists] = useState<ApolloList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [selectedList, setSelectedList] = useState<ApolloList | null>(null);

  // Apollo contacts & mapping state
  const [contacts, setContacts] = useState<ApolloContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Track if workspace was created during this modal session
  const createdWorkspaceRef = useRef(false);

  // Reset everything on open/close
  useEffect(() => {
    if (open) {
      setStep('choose');
      setLists([]);
      setListsLoading(false);
      setListSearch('');
      setSelectedList(null);
      setContacts([]);
      setContactsLoading(false);
      setMappings([]);
      setImporting(false);
      setProgress({ done: 0, total: 0 });
      createdWorkspaceRef.current = false;
    }
  }, [open]);

  // Filtered lists by search
  const filteredLists = useMemo(() => {
    if (!listSearch.trim()) return lists;
    const q = listSearch.toLowerCase();
    return lists.filter((l) => l.name.toLowerCase().includes(q));
  }, [lists, listSearch]);

  // ── Handlers ──

  const handleCsvChoice = useCallback(async () => {
    // Create workspace then open CSV upload modal
    await createWorkspace(tableType);
    onClose();
    // Small delay to let workspace state settle
    setTimeout(() => onCsvUpload(), 100);
  }, [createWorkspace, tableType, onClose, onCsvUpload]);

  const handleApolloChoice = useCallback(async () => {
    setStep('apollo_list');
    setListsLoading(true);
    try {
      const res = await fetch('/api/apollo?action=lists');
      if (!res.ok) throw new Error('Failed to fetch lists');
      const data = await res.json();
      setLists(data.lists || []);
    } catch (err) {
      toast('Failed to load Apollo lists', 'error');
      setStep('choose');
    } finally {
      setListsLoading(false);
    }
  }, [toast]);

  const handleListConfirm = useCallback(async () => {
    if (!selectedList) return;

    // 1. Create workspace
    setContactsLoading(true);
    await createWorkspace(tableType);
    createdWorkspaceRef.current = true;

    // 2. Fetch contacts from Apollo
    try {
      const res = await fetch('/api/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'contacts', listId: selectedList.id }),
      });
      if (!res.ok) throw new Error('Failed to fetch contacts');
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      toast('Failed to fetch Apollo contacts', 'error');
      setContactsLoading(false);
      return;
    }
    setContactsLoading(false);

    // Wait a tick for columns state to update after workspace creation
    setTimeout(() => {
      setStep('apollo_mapping');
    }, 200);
  }, [selectedList, createWorkspace, tableType, toast]);

  // Build mappings when we move to mapping step
  // We need to read columns from workspace context AFTER workspace is created
  // This is done via a separate effect
  const buildMappingsForCurrentColumns = useCallback(
    (currentColumns: ColumnDefinition[]) => {
      if (contacts.length === 0) return;

      // Determine which Apollo fields have data
      const apolloFields = Object.keys(APOLLO_FIELD_LABELS).filter((field) =>
        contacts.some((c) => {
          const val = c[field as keyof ApolloContact];
          return val !== undefined && val !== null && val !== '';
        }),
      );

      // Auto-match Apollo fields to workspace columns
      const autoMappings: ColumnMapping[] = apolloFields.map((field) => {
        const label = APOLLO_FIELD_LABELS[field];
        const normalized = label.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Try to match with existing columns
        let target: MappingValue = '__create__';
        for (const col of currentColumns) {
          const colNorm = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (colNorm === normalized || colNorm.includes(normalized) || normalized.includes(colNorm)) {
            target = col.id;
            break;
          }
        }

        return { apolloField: field, apolloLabel: label, target };
      });

      setMappings(autoMappings);
    },
    [contacts],
  );

  // When step changes to mapping, build the mappings
  useEffect(() => {
    if (step === 'apollo_mapping' && contacts.length > 0) {
      buildMappingsForCurrentColumns(columns);
    }
  }, [step, contacts, columns, buildMappingsForCurrentColumns]);

  const updateMapping = (index: number, value: MappingValue) => {
    setMappings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], target: value };
      return updated;
    });
  };

  const handleImport = useCallback(async () => {
    if (!activeWorkspace || contacts.length === 0) return;

    setImporting(true);
    setStep('importing');
    const total = contacts.length;
    setProgress({ done: 0, total });

    try {
      // 1. Resolve column mappings (create new columns as needed)
      const columnMap: Record<string, string> = {}; // apolloField → columnId
      const activeMappings = mappings.filter((m) => m.target !== '__skip__');

      for (const mapping of activeMappings) {
        if (mapping.target === '__create__') {
          const newCol = await addColumn(mapping.apolloLabel);
          if (newCol) {
            columnMap[mapping.apolloField] = newCol.id;
          }
        } else {
          columnMap[mapping.apolloField] = mapping.target;
        }
      }

      // 2. Batch insert rows + cells
      const batchSize = 50;
      let done = 0;

      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);

        const rowInserts = batch.map(() => ({
          workspace_id: activeWorkspace.id,
        }));
        const newRows = await db.insert<Row>('rows', rowInserts);

        if (!newRows || newRows.length === 0) {
          toast('Error inserting rows', 'error');
          break;
        }

        const cellInserts: Array<{ row_id: string; column_id: string; value: string }> = [];

        newRows.forEach((row, idx) => {
          const contact = batch[idx];
          Object.entries(columnMap).forEach(([apolloField, columnId]) => {
            const val = contact[apolloField as keyof ApolloContact];
            if (val !== undefined && val !== null && val !== '') {
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

        done += batch.length;
        setProgress({ done: Math.min(done, total), total });
      }

      await refreshData();
      toast(`Imported ${contacts.length} contacts from Apollo`, 'success');
      onClose();
    } catch (err) {
      console.error('Apollo import error:', err);
      toast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }, [activeWorkspace, contacts, mappings, addColumn, refreshData, toast, onClose]);

  const handleClose = () => {
    if (importing) return;
    onClose();
  };

  const tableLabel = tableType === 'people' ? 'People' : 'Company';

  return (
    <Modal open={open} onClose={handleClose} title={`Add ${tableLabel} Table`} width="max-w-2xl">
      {/* Step 1: Choose source */}
      {step === 'choose' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">How would you like to add data?</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Upload CSV option */}
            <button
              onClick={handleCsvChoice}
              className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-accent/30 transition-all text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 group-hover:bg-accent/10 flex items-center justify-center transition-colors">
                <svg className="w-6 h-6 text-gray-400 group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Upload CSV</p>
                <p className="text-xs text-gray-500 mt-1">Import data from a CSV file</p>
              </div>
            </button>

            {/* Pull from Apollo option */}
            {tableType === 'people' && (
              <button
                onClick={handleApolloChoice}
                className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-orange-500/30 transition-all text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 group-hover:bg-orange-500/10 flex items-center justify-center transition-colors">
                  <svg className="w-6 h-6 text-gray-400 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Pull from Apollo</p>
                  <p className="text-xs text-gray-500 mt-1">Import a saved contact list</p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Apollo list picker */}
      {step === 'apollo_list' && (
        <div className="space-y-4">
          <button
            onClick={() => setStep('choose')}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {listsLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="spinner mb-3" />
              <p className="text-sm text-gray-400">Loading Apollo lists…</p>
            </div>
          ) : (
            <>
              {/* Search bar */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search lists…"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  autoFocus
                />
              </div>

              {/* List of saved lists */}
              <div className="border border-white/10 rounded-lg overflow-hidden max-h-[350px] overflow-y-auto">
                {filteredLists.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-500">
                      {lists.length === 0 ? 'No saved people lists found in Apollo' : 'No lists match your search'}
                    </p>
                  </div>
                ) : (
                  filteredLists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => setSelectedList(list)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors border-b border-white/5 last:border-b-0
                        ${selectedList?.id === list.id
                          ? 'bg-accent/10 border-accent/20'
                          : 'hover:bg-white/5'
                        }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${selectedList?.id === list.id ? 'text-accent' : 'text-gray-200'}`}>
                          {list.name}
                        </p>
                      </div>
                      <span className="flex-shrink-0 ml-3 text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                        {list.count} contacts
                      </span>
                    </button>
                  ))
                )}
              </div>

              {/* Confirm button */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleListConfirm}
                  disabled={!selectedList || contactsLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {contactsLoading ? (
                    <>
                      <span className="spinner" />
                      Fetching contacts…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Pull {selectedList ? `"${selectedList.name}"` : 'List'}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Column mapping */}
      {step === 'apollo_mapping' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              Pulled <strong className="text-gray-200">{contacts.length}</strong> contacts from{' '}
              <strong className="text-gray-200">{selectedList?.name}</strong>
            </span>
          </div>

          <div className="border border-white/10 rounded-lg overflow-hidden">
            <div className="grid grid-cols-2 gap-0 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-white/10">
              <span>Apollo Field</span>
              <span>Map To</span>
            </div>
            <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
              {mappings.map((mapping, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-4 px-4 py-2.5 items-center">
                  <span className="text-sm font-medium text-gray-200 truncate">
                    {mapping.apolloLabel}
                  </span>
                  <select
                    value={mapping.target}
                    onChange={(e) => updateMapping(idx, e.target.value)}
                    className="text-sm border border-white/10 rounded-md px-2 py-1.5 bg-white/5 text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    <optgroup label="Existing Columns">
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                    </optgroup>
                    <option value="__create__">— Create as new column —</option>
                    <option value="__skip__">— Skip this field —</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleClose}
              disabled={importing}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || contacts.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
            >
              Import {contacts.length} Contacts
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="space-y-4 py-4">
          <div className="flex flex-col items-center justify-center">
            <span className="spinner mb-3" />
            <p className="text-sm font-medium text-gray-200">Importing contacts…</p>
            <p className="text-xs text-gray-500 mt-1">
              {progress.done}/{progress.total} rows
            </p>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
