'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/lib/workspace-context';

interface ToolbarProps {
  onUploadCsv: () => void;
  onAddColumn: () => void;
  onAddAiColumn: () => void;
}

export default function Toolbar({ onUploadCsv, onAddColumn, onAddAiColumn }: ToolbarProps) {
  const { activeWorkspace, renameWorkspace, addRow } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = () => {
    if (!activeWorkspace) return;
    setEditName(activeWorkspace.name);
    setEditing(true);
  };

  const commitName = () => {
    if (!activeWorkspace) return;
    const trimmed = editName.trim();
    if (trimmed && trimmed !== activeWorkspace.name) {
      renameWorkspace(activeWorkspace.id, trimmed);
    }
    setEditing(false);
  };

  if (!activeWorkspace) {
    return (
      <div className="flex items-center h-14 px-5 border-b border-border">
        <span className="text-gray-400 text-sm">Select or create a table to get started</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between h-14 px-5 border-b border-border">
      {/* Left: workspace name */}
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="text-lg font-semibold bg-transparent border-b-2 border-accent outline-none py-0.5 px-1 -ml-1"
          />
        ) : (
          <button
            onClick={startEditing}
            className="text-lg font-semibold text-foreground hover:text-accent transition-colors py-0.5 px-1 -ml-1 rounded"
            title="Click to rename"
          >
            {activeWorkspace.name}
          </button>
        )}
        <span className="text-xs font-medium text-muted bg-white/10 px-2 py-0.5 rounded-full capitalize">
          {activeWorkspace.table_type}
        </span>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2">
        <ToolbarButton onClick={onUploadCsv} icon={<UploadIcon />} label="Upload CSV" />
        <ToolbarButton onClick={addRow} icon={<RowIcon />} label="+ Row" />
        <ToolbarButton onClick={onAddColumn} icon={<PlusIcon />} label="+ Column" />
        <ToolbarButton
          onClick={onAddAiColumn}
          icon={<SparklesIcon />}
          label="+ AI Column"
          accent
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
  accent = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
        ${
          accent
            ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
            : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
        }`}
    >
      {icon}
      {label}
    </button>
  );
}

function RowIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}
