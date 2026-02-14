'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';
import type { AiEnrichRequest, OutputType } from '@/lib/types';

interface AiColumnModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AiColumnModal({ open, onClose }: AiColumnModalProps) {
  const { addAiColumn, columns, gridRows, activeWorkspace, refreshData } = useWorkspace();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [outputType, setOutputType] = useState<OutputType>('text');
  const [creating, setCreating] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });

  const handleCreate = async (runImmediately: boolean) => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedName || !trimmedPrompt) return;

    setCreating(true);
    const col = await addAiColumn(trimmedName, trimmedPrompt, outputType);
    setCreating(false);

    if (!col) {
      toast('Failed to create AI column', 'error');
      return;
    }

    toast(`AI column "${trimmedName}" created`, 'success');

    if (runImmediately && gridRows.length > 0) {
      await runEnrichment(col.id, trimmedPrompt, outputType);
    }

    setName('');
    setPrompt('');
    setOutputType('text');
    onClose();
  };

  const runEnrichment = async (
    columnId: string,
    aiPrompt: string,
    outType: OutputType,
  ) => {
    if (!activeWorkspace) return;

    setEnriching(true);
    const total = gridRows.length;
    setEnrichProgress({ done: 0, total });

    // Process in parallel batches of 5
    const batchSize = 5;
    let done = 0;

    for (let i = 0; i < gridRows.length; i += batchSize) {
      const batch = gridRows.slice(i, i + batchSize);

      const promises = batch.map(async (row) => {
        // Build row context from all non-AI columns
        const rowContext: Record<string, string> = {};
        columns.forEach((col) => {
          if (!col.is_ai_column && row[col.id]) {
            rowContext[col.name] = row[col.id] as string;
          }
        });

        const payload: AiEnrichRequest = {
          columnId,
          rowId: row._rowId,
          prompt: aiPrompt,
          outputType: outType,
          rowContext,
          tableType: activeWorkspace.table_type,
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
          return { error: 'Failed' };
        }
      });

      await Promise.all(promises);
      done += batch.length;
      setEnrichProgress({ done: Math.min(done, total), total });
    }

    await refreshData();
    setEnriching(false);
    toast(`Enriched ${total} rows`, 'success');
  };

  const handleClose = () => {
    if (enriching) return; // Don't close during enrichment
    setName('');
    setPrompt('');
    setOutputType('text');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add AI Column" width="max-w-xl">
      <div className="space-y-4">
        {/* Column Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Column Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Industry"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            autoFocus
          />
        </div>

        {/* Prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Based on the company name and website, determine what industry this company is in"
            rows={3}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            The AI will have access to all other column values for each row as context.
          </p>
        </div>

        {/* Output Type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Output Type</label>
          <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
            {(['text', 'number', 'boolean'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOutputType(t)}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize
                  ${outputType === t ? 'bg-white/10 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {t === 'boolean' ? 'True / False' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Enrichment Progress */}
        {enriching && (
          <div className="space-y-2 bg-accent/10 rounded-lg p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-accent font-medium">
                <span className="spinner" />
                Enriching…
              </span>
              <span className="text-gray-400 text-xs">
                {enrichProgress.done}/{enrichProgress.total} rows
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{
                  width: `${enrichProgress.total ? (enrichProgress.done / enrichProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={creating || enriching}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => handleCreate(false)}
            disabled={!name.trim() || !prompt.trim() || creating || enriching}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/10 hover:bg-white/15 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
          <button
            onClick={() => handleCreate(true)}
            disabled={!name.trim() || !prompt.trim() || creating || enriching}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Create & Run
          </button>
        </div>
      </div>
    </Modal>
  );
}
