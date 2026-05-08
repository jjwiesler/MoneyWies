import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import Transactions from "./pages/Transactions.jsx";
import Rules from "./pages/Rules.jsx";
import Income from "./pages/Income.jsx";
import Expenses from "./pages/Expenses.jsx";
import Properties from "./pages/Properties.jsx";
import Reports from "./pages/Reports.jsx";
import TokenUsage from "./pages/TokenUsage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Accounts from "./pages/Accounts.jsx";
import Import from "./pages/Import.jsx";
import Reconcile from "./pages/Reconcile.jsx";
import Recurring from "./pages/Recurring.jsx";
import Settings from "./pages/Settings.jsx";
import WorkspaceAuth from "./pages/WorkspaceAuth.jsx";
import WorkspaceAdmin from "./pages/WorkspaceAdmin.jsx";

function AppInner() {
  const [chatOpen, setChatOpen] = useState(false);
  const { workspace } = useWorkspace();

  // Still loading
  if (workspace === undefined) return null;

  // No workspace — show token entry
  if (workspace === null) return <WorkspaceAuth />;

  return (
    <div className="app">
      <Sidebar onChatOpen={() => setChatOpen(true)} />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/income" element={<Income />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/properties" element={<Properties />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/token-usage" element={<TokenUsage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/import" element={<Import />} />
        <Route path="/reconcile" element={<Reconcile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/workspaces" element={<WorkspaceAdmin />} />
      </Routes>
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <AppInner />
    </WorkspaceProvider>
  );
}
