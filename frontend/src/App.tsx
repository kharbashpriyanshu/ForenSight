import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import CaseOverview from './pages/CaseOverview';
import EvidenceLibrary from './pages/EvidenceLibrary';
import EvidenceDetail from './pages/EvidenceDetail';
import AuditTimeline from './pages/AuditTimeline';
import ReportsInterface from './pages/ReportsInterface';
import SystemHealth from './pages/SystemHealth';
import CasesList from './pages/CasesList';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/legacy" replace />} />
        
        <Route path="/legacy" element={<AppLayout><Dashboard /></AppLayout>} />

        <Route path="/cases" element={<AppLayout><CasesList /></AppLayout>} />

        <Route path="/cases/:caseId" element={<Workspace />}>
          <Route index element={<CaseOverview />} />
          <Route path="evidence" element={<EvidenceLibrary />} />
          <Route path="evidence/:evidenceId" element={<EvidenceDetail />} />
          <Route path="timeline" element={<AuditTimeline />} />
          <Route path="findings" element={<ReportsInterface />} />
          <Route path="reports" element={<ReportsInterface />} />
        </Route>
        <Route path="/system" element={<SystemHealth />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
