import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workspace = lazy(() => import('./pages/Workspace'));
const CaseOverview = lazy(() => import('./pages/CaseOverview'));
const EvidenceLibrary = lazy(() => import('./pages/EvidenceLibrary'));
const EvidenceDetail = lazy(() => import('./pages/EvidenceDetail'));
const AuditTimeline = lazy(() => import('./pages/AuditTimeline'));
const ReportsInterface = lazy(() => import('./pages/ReportsInterface'));
const EvidenceComparison = lazy(() => import('./pages/EvidenceComparison'));
const AnalystWorkspace = lazy(() => import('./pages/AnalystWorkspace'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const CasesList = lazy(() => import('./pages/CasesList'));
const InvestigationAssistant = lazy(() => import('./pages/InvestigationAssistant'));
const CrossImageCorrelation = lazy(() => import('./pages/CrossImageCorrelation'));
const ChainOfCustody = lazy(() => import('./pages/ChainOfCustody'));
const InvestigationGraphPage = lazy(() => import('./pages/InvestigationGraphPage'));
const BenchmarkDashboard = lazy(() => import('./components/benchmark/BenchmarkDashboard'));
const ImageLineagePage = lazy(() => import('./pages/ImageLineagePage'));
const ProcessingHistoryPage = lazy(() => import('./pages/ProcessingHistoryPage'));

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
      <Suspense fallback={<div className="route-loading" role="status">Loading investigation view…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/cases" replace />} />
        
        <Route path="/legacy" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />

        <Route path="/cases" element={<ProtectedRoute><AppLayout><CasesList /></AppLayout></ProtectedRoute>} />
        <Route path="/benchmark" element={<ProtectedRoute><AppLayout><BenchmarkDashboard /></AppLayout></ProtectedRoute>} />

        <Route path="/cases/:caseId" element={<ProtectedRoute><Workspace /></ProtectedRoute>}>
          <Route index element={<CaseOverview />} />
          <Route path="evidence" element={<EvidenceLibrary />} />
          <Route path="evidence/:evidenceId" element={<EvidenceDetail />} />
          <Route path="compare" element={<EvidenceComparison />} />
          <Route path="lineage" element={<ImageLineagePage />} />
          <Route path="evidence/:evidenceId/history" element={<ProcessingHistoryPage />} />
          <Route path="cross-correlation" element={<CrossImageCorrelation />} />
          <Route path="graph" element={<InvestigationGraphPage />} />
          <Route path="assistant" element={<InvestigationAssistant />} />
          <Route path="analyst" element={<AnalystWorkspace />} />
          <Route path="custody" element={<ChainOfCustody />} />
          <Route path="audit" element={<AuditTimeline />} />
          <Route path="findings" element={<ReportsInterface />} />
          <Route path="reports" element={<ReportsInterface />} />
        </Route>
        <Route path="/system" element={<ProtectedRoute><AppLayout><SystemHealth /></AppLayout></ProtectedRoute>} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
