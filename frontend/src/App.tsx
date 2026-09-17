import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import CaseOverview from './pages/CaseOverview';
import EvidenceLibrary from './pages/EvidenceLibrary';
import EvidenceDetail from './pages/EvidenceDetail';
import AuditTimeline from './pages/AuditTimeline';
import ReportsInterface from './pages/ReportsInterface';
import EvidenceComparison from './pages/EvidenceComparison';
import SystemHealth from './pages/SystemHealth';
import CasesList from './pages/CasesList';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/cases" replace />} />
        
        <Route path="/legacy" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />

        <Route path="/cases" element={<ProtectedRoute><AppLayout><CasesList /></AppLayout></ProtectedRoute>} />

        <Route path="/cases/:caseId" element={<ProtectedRoute><Workspace /></ProtectedRoute>}>
          <Route index element={<CaseOverview />} />
          <Route path="evidence" element={<EvidenceLibrary />} />
          <Route path="evidence/:evidenceId" element={<EvidenceDetail />} />
          <Route path="compare" element={<EvidenceComparison />} />
          <Route path="audit" element={<AuditTimeline />} />
          <Route path="findings" element={<ReportsInterface />} />
          <Route path="reports" element={<ReportsInterface />} />
        </Route>
        <Route path="/system" element={<ProtectedRoute><SystemHealth /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
