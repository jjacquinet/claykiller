'use client';

import { useCallback, useState } from 'react';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace-context';
import { ToastProvider } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import DataGrid from '@/components/DataGrid';
import CsvUploadModal from '@/components/CsvUploadModal';
import AddColumnModal from '@/components/AddColumnModal';
import AiColumnModal from '@/components/AiColumnModal';
import RunAiColumnModal from '@/components/RunAiColumnModal';
import ColumnSettingsModal from '@/components/ColumnSettingsModal';
import VerifyEmailsModal from '@/components/VerifyEmailsModal';
import NewTableModal from '@/components/NewTableModal';
import AddDataModal from '@/components/AddDataModal';

export default function Home() {
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    </ToastProvider>
  );
}

function AppShell() {
  const { columns, activeTab } = useWorkspace();
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [aiColumnOpen, setAiColumnOpen] = useState(false);
  const [runAiColumnId, setRunAiColumnId] = useState<string | null>(null);
  const [runAiSelectedRowIds, setRunAiSelectedRowIds] = useState<string[]>([]);
  const [settingsColumnId, setSettingsColumnId] = useState<string | null>(null);
  const [verifyEmailsOpen, setVerifyEmailsOpen] = useState(false);
  const [globalSelectedRowIds, setGlobalSelectedRowIds] = useState<string[]>([]);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [addDataOpen, setAddDataOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const runAiColumn = columns.find((c) => c.id === runAiColumnId && c.is_ai_column) ?? null;
  const settingsColumn = columns.find((c) => c.id === settingsColumnId) ?? null;

  const handleRunAiColumn = useCallback((columnId: string, selectedRowIds: string[]) => {
    setRunAiColumnId(columnId);
    setRunAiSelectedRowIds(selectedRowIds);
  }, []);

  const handleOpenColumnSettings = useCallback((columnId: string) => {
    setSettingsColumnId(columnId);
  }, []);

  const handleSelectedRowsChanged = useCallback((rowIds: string[]) => {
    setGlobalSelectedRowIds(rowIds);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar onNewTable={() => setNewTableOpen(true)} />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Toolbar
          onAddData={() => setAddDataOpen(true)}
          onAddColumn={() => setAddColumnOpen(true)}
          onAddAiColumn={() => setAiColumnOpen(true)}
          onVerifyEmails={() => setVerifyEmailsOpen(true)}
          searchText={searchText}
          onSearchChange={setSearchText}
        />

        {/* Grid area — needs explicit height for AG Grid */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0">
            <DataGrid onRunAiColumn={handleRunAiColumn} onOpenColumnSettings={handleOpenColumnSettings} onSelectedRowsChanged={handleSelectedRowsChanged} searchText={searchText} />
          </div>
        </div>
      </div>

      {/* Modals */}
      <CsvUploadModal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} />
      <AddColumnModal open={addColumnOpen} onClose={() => setAddColumnOpen(false)} />
      <AiColumnModal open={aiColumnOpen} onClose={() => setAiColumnOpen(false)} />
      <RunAiColumnModal
        open={runAiColumnId !== null}
        onClose={() => { setRunAiColumnId(null); setRunAiSelectedRowIds([]); }}
        column={runAiColumn}
        selectedRowIds={runAiSelectedRowIds}
      />
      <ColumnSettingsModal
        open={settingsColumnId !== null}
        onClose={() => setSettingsColumnId(null)}
        column={settingsColumn}
      />
      <VerifyEmailsModal
        open={verifyEmailsOpen}
        onClose={() => setVerifyEmailsOpen(false)}
        selectedRowIds={globalSelectedRowIds}
      />
      <NewTableModal
        open={newTableOpen}
        onClose={() => setNewTableOpen(false)}
        tableType={activeTab}
        onCsvUpload={() => setCsvModalOpen(true)}
      />
      <AddDataModal
        open={addDataOpen}
        onClose={() => setAddDataOpen(false)}
        onCsvUpload={() => setCsvModalOpen(true)}
      />
    </div>
  );
}
