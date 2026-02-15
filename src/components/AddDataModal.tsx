'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import { db } from '@/lib/db';
import { DEFAULT_COLUMNS } from '@/lib/types';
import type { ColumnDefinition, Row } from '@/lib/types';

type Step =
  | 'choose'
  | 'apollo_list'
  | 'apollo_mapping'
  | 'apollo_importing'
  | 'single_row';

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

interface AddDataModalProps {
  open: boolean;
  onClose: () => void;
  onCsvUpload: () => void;
}

export default function AddDataModal({ open, onClose, onCsvUpload }: AddDataModalProps) {
  const { columns, activeWorkspace, addColumn, refreshData } = useWorkspace();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('choose');

  // ── Apollo state ──
  const [lists, setLists] = useState<ApolloList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [selectedList, setSelectedList] = useState<ApolloList | null>(null);
  const [contacts, setContacts] = useState<ApolloContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // ── Single row state ──
  const [singleRowValues, setSingleRowValues] = useState<Record<string, string>>({});
  const [extraColumns, setExtraColumns] = useState<{ name: string; value: string }[]>([]);
  const [newColName, setNewColName] = useState('');
  const [savingRow, setSavingRow] = useState(false);

  const isPeople = activeWorkspace?.table_type === 'people';

  // Protected (default) columns for the current table type
  const defaultCols = useMemo(() => {
    if (!activeWorkspace) return [];
    return DEFAULT_COLUMNS[activeWorkspace.table_type].filter(
      // Skip Email Status since it's auto-populated by verification
      (dc) => dc.field_key !== 'email_status',
    );
  }, [activeWorkspace]);

  // Map default column field_key → actual column id (if exists)
  const defaultColMap = useMemo(() => {
    const map: Record<string, ColumnDefinition | undefined> = {};
    for (const dc of defaultCols) {
      map[dc.field_key] = columns.find((c) => c.field_key === dc.field_key);
    }
    return map;
  }, [defaultCols, columns]);

  // Reset on open
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
      setSingleRowValues({});
      setExtraColumns([]);
      setNewColName('');
      setSavingRow(false);
    }
  }, [open]);

  // Filtered Apollo lists
  const filteredLists = useMemo(() => {
    if (!listSearch.trim()) return lists;
    const q = listSearch.toLowerCase();
    return lists.filter((l) => l.name.toLowerCase().includes(q));
  }, [lists, listSearch]);

  // ── Choose handlers ──

  const handleCsvChoice = useCallback(() => {
    onClose();
    setTimeout(() => onCsvUpload(), 50);
  }, [onClose, onCsvUpload]);

  const handleSingleRowChoice = useCallback(() => {
    setStep('single_row');
    // Initialize empty values for default columns
    const vals: Record<string, string> = {};
    for (const dc of defaultCols) {
      vals[dc.field_key] = '';
    }
    setSingleRowValues(vals);
    setExtraColumns([]);
  }, [defaultCols]);

  // ── Apollo handlers ──

  const handleApolloChoice = useCallback(async () => {
    setStep('apollo_list');
    setListsLoading(true);
    try {
      const res = await fetch('/api/apollo?action=lists');
      if (!res.ok) throw new Error('Failed to fetch lists');
      const data = await res.json();
      setLists(data.lists || []);
    } catch {
      toast('Failed to load Apollo lists', 'error');
      setStep('choose');
    } finally {
      setListsLoading(false);
    }
  }, [toast]);

  const handleListConfirm = useCallback(async () => {
    if (!selectedList) return;
    setContactsLoading(true);
    try {
      const res = await fetch('/api/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'contacts', listId: selectedList.id }),
      });
      if (!res.ok) throw new Error('Failed to fetch contacts');
      const data = await res.json();
      const fetchedContacts: ApolloContact[] = data.contacts || [];
      setContacts(fetchedContacts);

      // Build mappings against current columns
      const apolloFields = Object.keys(APOLLO_FIELD_LABELS).filter((field) =>
        fetchedContacts.some((c) => {
          const val = c[field as keyof ApolloContact];
          return val !== undefined && val !== null && val !== '';
        }),
      );

      const autoMappings: ColumnMapping[] = apolloFields.map((field) => {
        const label = APOLLO_FIELD_LABELS[field];
        const normalized = label.toLowerCase().replace(/[^a-z0-9]/g, '');
        let target: MappingValue = '__create__';
        for (const col of columns) {
          const colNorm = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (colNorm === normalized || colNorm.includes(normalized) || normalized.includes(colNorm)) {
            target = col.id;
            break;
          }
        }
        return { apolloField: field, apolloLabel: label, target };
      });

      setMappings(autoMappings);
      setStep('apollo_mapping');
    } catch {
      toast('Failed to fetch Apollo contacts', 'error');
    } finally {
      setContactsLoading(false);
    }
  }, [selectedList, columns, toast]);

  const updateMapping = (index: number, value: MappingValue) => {
    setMappings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], target: value };
      return updated;
    });
  };

  const handleApolloImport = useCallback(async () => {
    if (!activeWorkspace || contacts.length === 0) return;

    setImporting(true);
    setStep('apollo_importing');
    const total = contacts.length;
    setProgress({ done: 0, total });

    try {
      const columnMap: Record<string, string> = {};
      const activeMappings = mappings.filter((m) => m.target !== '__skip__');

      for (const mapping of activeMappings) {
        if (mapping.target === '__create__') {
          const newCol = await addColumn(mapping.apolloLabel);
          if (newCol) columnMap[mapping.apolloField] = newCol.id;
        } else {
          columnMap[mapping.apolloField] = mapping.target;
        }
      }

      const batchSize = 50;
      let done = 0;

      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        const rowInserts = batch.map(() => ({ workspace_id: activeWorkspace.id }));
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
              cellInserts.push({ row_id: row.id, column_id: columnId, value: val });
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
    } catch {
      toast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }, [activeWorkspace, contacts, mappings, addColumn, refreshData, toast, onClose]);

  // ── Single row handlers ──

  const handleSingleRowSave = useCallback(async () => {
    if (!activeWorkspace) return;
    setSavingRow(true);
    try {
      // 1. Create the row
      const newRow = await db.insertOne<Row>('rows', { workspace_id: activeWorkspace.id });

      // 2. Insert cell values for default columns
      const cellInserts: Array<{ row_id: string; column_id: string; value: string }> = [];

      for (const dc of defaultCols) {
        const val = singleRowValues[dc.field_key]?.trim();
        if (!val) continue;
        const col = defaultColMap[dc.field_key];
        if (col) {
          cellInserts.push({ row_id: newRow.id, column_id: col.id, value: val });
        }
      }

      // 3. Handle extra columns — create them if they don't exist, then insert values
      for (const extra of extraColumns) {
        const trimmedName = extra.name.trim();
        const trimmedVal = extra.value.trim();
        if (!trimmedName || !trimmedVal) continue;

        // Check if column already exists
        let col = columns.find(
          (c) => c.name.toLowerCase() === trimmedName.toLowerCase(),
        );
        if (!col) {
          col = (await addColumn(trimmedName)) ?? undefined;
        }
        if (col) {
          cellInserts.push({ row_id: newRow.id, column_id: col.id, value: trimmedVal });
        }
      }

      if (cellInserts.length > 0) {
        await db.insert('cell_values', cellInserts);
      }

      await refreshData();
      toast('Row added', 'success');
      onClose();
    } catch {
      toast('Failed to add row', 'error');
    } finally {
      setSavingRow(false);
    }
  }, [activeWorkspace, defaultCols, defaultColMap, singleRowValues, extraColumns, columns, addColumn, refreshData, toast, onClose]);

  const handleAddExtraColumn = useCallback(() => {
    const name = newColName.trim();
    if (!name) return;
    setExtraColumns((prev) => [...prev, { name, value: '' }]);
    setNewColName('');
  }, [newColName]);

  const updateExtraColumn = (index: number, field: 'name' | 'value', val: string) => {
    setExtraColumns((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const removeExtraColumn = (index: number) => {
    setExtraColumns((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    if (importing || savingRow) return;
    onClose();
  };

  const tableLabel = activeWorkspace?.table_type === 'people' ? 'People' : 'Companies';

  return (
    <Modal open={open} onClose={handleClose} title={`Add ${tableLabel}`} width="max-w-2xl">
      {/* ────── Step 1: Choose method ────── */}
      {step === 'choose' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">How would you like to add data?</p>
          <div className={`grid gap-3 ${isPeople ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {/* Upload CSV */}
            <button
              onClick={handleCsvChoice}
              className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-accent/30 transition-all text-center"
            >
              <div className="w-11 h-11 rounded-xl bg-white/5 group-hover:bg-accent/10 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-400 group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Upload CSV</p>
                <p className="text-xs text-gray-500 mt-1">Import from file</p>
              </div>
            </button>

            {/* Pull from Apollo — people only */}
            {isPeople && (
              <button
                onClick={handleApolloChoice}
                className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-orange-500/30 transition-all text-center"
              >
                <div className="w-11 h-11 rounded-xl bg-white/5 group-hover:bg-orange-500/10 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Pull from Apollo</p>
                  <p className="text-xs text-gray-500 mt-1">Import saved list</p>
                </div>
              </button>
            )}

            {/* Add Single Row */}
            <button
              onClick={handleSingleRowChoice}
              className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-emerald-500/30 transition-all text-center"
            >
              <div className="w-11 h-11 rounded-xl bg-white/5 group-hover:bg-emerald-500/10 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-400 group-hover:text-emerald-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Add Single Row</p>
                <p className="text-xs text-gray-500 mt-1">Enter manually</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ────── Apollo: List picker ────── */}
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
                        ${selectedList?.id === list.id ? 'bg-accent/10 border-accent/20' : 'hover:bg-white/5'}`}
                    >
                      <p className={`text-sm font-medium truncate ${selectedList?.id === list.id ? 'text-accent' : 'text-gray-200'}`}>
                        {list.name}
                      </p>
                      <span className="flex-shrink-0 ml-3 text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                        {list.count} contacts
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleListConfirm}
                  disabled={!selectedList || contactsLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {contactsLoading ? (
                    <><span className="spinner" /> Fetching contacts…</>
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

      {/* ────── Apollo: Column mapping ────── */}
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
                  <span className="text-sm font-medium text-gray-200 truncate">{mapping.apolloLabel}</span>
                  <select
                    value={mapping.target}
                    onChange={(e) => updateMapping(idx, e.target.value)}
                    className="text-sm border border-white/10 rounded-md px-2 py-1.5 bg-white/5 text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    <optgroup label="Existing Columns">
                      {columns.map((col) => (
                        <option key={col.id} value={col.id}>{col.name}</option>
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
            <button onClick={handleClose} disabled={importing} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={handleApolloImport}
              disabled={importing || contacts.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
            >
              Import {contacts.length} Contacts
            </button>
          </div>
        </div>
      )}

      {/* ────── Apollo: Importing progress ────── */}
      {step === 'apollo_importing' && (
        <div className="space-y-4 py-4">
          <div className="flex flex-col items-center justify-center">
            <span className="spinner mb-3" />
            <p className="text-sm font-medium text-gray-200">Importing contacts…</p>
            <p className="text-xs text-gray-500 mt-1">{progress.done}/{progress.total} rows</p>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* ────── Single Row form ────── */}
      {step === 'single_row' && (
        <div className="space-y-5">
          <button
            onClick={() => setStep('choose')}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          {/* Default column fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Default Columns</p>
            <div className="grid grid-cols-2 gap-3">
              {defaultCols.map((dc) => (
                <div key={dc.field_key}>
                  <label className="block text-sm font-medium text-gray-300 mb-1">{dc.name}</label>
                  <input
                    type="text"
                    value={singleRowValues[dc.field_key] ?? ''}
                    onChange={(e) =>
                      setSingleRowValues((prev) => ({ ...prev, [dc.field_key]: e.target.value }))
                    }
                    placeholder={dc.name}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    disabled={savingRow}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Extra columns */}
          {extraColumns.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Additional Columns</p>
              {extraColumns.map((extra, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Column Name</label>
                    <input
                      type="text"
                      value={extra.name}
                      onChange={(e) => updateExtraColumn(idx, 'name', e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30"
                      disabled={savingRow}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Value</label>
                    <input
                      type="text"
                      value={extra.value}
                      onChange={(e) => updateExtraColumn(idx, 'value', e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30"
                      disabled={savingRow}
                    />
                  </div>
                  <button
                    onClick={() => removeExtraColumn(idx)}
                    disabled={savingRow}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add extra column input */}
          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">New Column Name</label>
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddExtraColumn();
                }}
                placeholder="e.g. Phone Number"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30"
                disabled={savingRow}
              />
            </div>
            <button
              onClick={handleAddExtraColumn}
              disabled={!newColName.trim() || savingRow}
              className="px-3 py-2 text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Column
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
            <button
              onClick={handleClose}
              disabled={savingRow}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSingleRowSave}
              disabled={savingRow}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {savingRow ? (
                <><span className="spinner" /> Saving…</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Add Row
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
