'use client';

import { useWorkspace } from '@/lib/workspace-context';
import type { TableType } from '@/lib/types';

export default function Sidebar() {
  const {
    workspaces,
    activeWorkspace,
    activeTab,
    setActiveTab,
    selectWorkspace,
    createWorkspace,
  } = useWorkspace();

  const filteredWorkspaces = workspaces.filter((w) => w.table_type === activeTab);

  return (
    <aside className="flex flex-col w-64 min-w-64 h-screen bg-sidebar-bg text-sidebar-text">
      {/* Logo / App name */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="font-semibold text-white text-[15px] tracking-tight">ClayKiller</span>
      </div>

      {/* Tab switcher: People / Companies */}
      <div className="flex gap-1 px-3 pt-4 pb-2">
        <TabButton
          label="People"
          active={activeTab === 'people'}
          onClick={() => setActiveTab('people')}
        />
        <TabButton
          label="Companies"
          active={activeTab === 'companies'}
          onClick={() => setActiveTab('companies')}
        />
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {filteredWorkspaces.length === 0 && (
          <p className="text-xs text-gray-500 px-2 py-4 text-center">
            No {activeTab} tables yet
          </p>
        )}
        {filteredWorkspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => selectWorkspace(ws.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors truncate
              ${
                activeWorkspace?.id === ws.id
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
          >
            <span className="flex items-center gap-2">
              <TableIcon type={ws.table_type} />
              {ws.name}
            </span>
          </button>
        ))}
      </div>

      {/* New Table button */}
      <div className="px-3 pb-4 pt-2">
        <button
          onClick={() => createWorkspace(activeTab)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
            bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors border border-white/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Table
        </button>
      </div>
    </aside>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
        ${active ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
    >
      {label}
    </button>
  );
}

function TableIcon({ type }: { type: TableType }) {
  if (type === 'people') {
    return (
      <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}
