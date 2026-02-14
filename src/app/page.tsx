'use client';

import { useState } from 'react';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { ToastProvider } from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import DataGrid from '@/components/DataGrid';
import CsvUploadModal from '@/components/CsvUploadModal';
import AddColumnModal from '@/components/AddColumnModal';
import AiColumnModal from '@/components/AiColumnModal';

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
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [aiColumnOpen, setAiColumnOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Toolbar
          onUploadCsv={() => setCsvModalOpen(true)}
          onAddColumn={() => setAddColumnOpen(true)}
          onAddAiColumn={() => setAiColumnOpen(true)}
        />

        {/* Grid area — needs explicit height for AG Grid */}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0">
            <DataGrid />
          </div>
        </div>
      </div>

      {/* Modals */}
      <CsvUploadModal open={csvModalOpen} onClose={() => setCsvModalOpen(false)} />
      <AddColumnModal open={addColumnOpen} onClose={() => setAddColumnOpen(false)} />
      <AiColumnModal open={aiColumnOpen} onClose={() => setAiColumnOpen(false)} />
    </div>
  );
}
