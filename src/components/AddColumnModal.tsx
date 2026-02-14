'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useWorkspace } from '@/lib/workspace-context';
import { useToast } from '@/components/Toast';

interface AddColumnModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AddColumnModal({ open, onClose }: AddColumnModalProps) {
  const { addColumn } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const col = await addColumn(trimmed);
    setSaving(false);
    if (col) {
      toast(`Column "${trimmed}" added`, 'success');
      setName('');
      onClose();
    } else {
      toast('Failed to add column', 'error');
    }
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Column">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Column Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="e.g., Phone Number"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 rounded-lg hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
