'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/lib/workspace-context';

interface ToolbarProps {
  onAddData: () => void;
  onAddColumn: () => void;
  onAddAiColumn: () => void;
  onVerifyEmails?: () => void;
  searchText: string;
  onSearchChange: (text: string) => void;
}

export default function Toolbar({ onAddData, onAddColumn, onAddAiColumn, onVerifyEmails, searchText, onSearchChange }: ToolbarProps) {
  const { activeWorkspace, renameWorkspace } = useWorkspace();
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

      {/* Center: search */}
      <div className="flex-1 flex justify-center px-4 max-w-md mx-auto">
        <div className="relative w-full">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search…"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
          />
          {searchText && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2">
        {activeWorkspace.table_type === 'people' && onVerifyEmails && (
          <ToolbarButton onClick={onVerifyEmails} icon={<VerifyIcon />} label="Verify Emails" />
        )}
        <ToolbarButton
          onClick={onAddData}
          icon={<AddDataIcon />}
          label={activeWorkspace.table_type === 'people' ? 'Add People' : 'Add Companies'}
        />
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

function AddDataIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
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

function VerifyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
