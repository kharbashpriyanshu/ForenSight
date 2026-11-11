import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';

const Login = lazy(() => import('./pages/Login'));
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
const EvidenceIntake = lazy(() => import('./pages/EvidenceIntake'));

// Backward-compatibility redirect helpers
function EvidenceNewRedirect() {
  const { caseId } = useParams<{ caseId: string }>();
  return <Navigate to={`/cases/${caseId}/evidence/upload`} replace />;
}

function FindingsRedirect() {
  const { caseId } = useParams<{ caseId: string }>();
  return <Navigate to={`/cases/${caseId}/reports`} replace />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="route-loading" role="status">Loading investigation view…</div>}>
            <Routes>
              {/* Public Authentication Route */}
              <Route path="/login" element={<Login />} />

              {/* Backward-Compatible Route Redirects */}
              <Route path="/" element={<Navigate to="/cases" replace />} />
              <Route path="/legacy" element={<Navigate to="/cases" replace />} />

              {/* Unified Authenticated Application Shell */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                {/* Global Station Routes */}
                <Route path="/cases" element={<CasesList />} />
                <Route path="/cases/intake" element={<EvidenceIntake />} />
                <Route path="/intake" element={<Navigate to="/cases/intake" replace />} />
                <Route path="/investigate" element={<Navigate to="/cases/intake" replace />} />
                <Route path="/benchmark" element={<BenchmarkDashboard />} />
                <Route path="/system" element={<SystemHealth />} />

                {/* Case Workspace Navigation Sub-Shell */}
                <Route path="/cases/:caseId" element={<Workspace />}>
                  <Route index element={<CaseOverview />} />
                  <Route path="evidence" element={<EvidenceLibrary />} />
                  <Route path="evidence/upload" element={<EvidenceIntake />} />
                  <Route path="evidence/new" element={<EvidenceNewRedirect />} />
                  <Route path="evidence/:evidenceId" element={<EvidenceDetail />} />
                  <Route path="evidence/:evidenceId/history" element={<ProcessingHistoryPage />} />
                  <Route path="compare" element={<EvidenceComparison />} />
                  <Route path="lineage" element={<ImageLineagePage />} />
                  <Route path="cross-correlation" element={<CrossImageCorrelation />} />
                  <Route path="graph" element={<InvestigationGraphPage />} />
                  <Route path="assistant" element={<InvestigationAssistant />} />
                  <Route path="analyst" element={<AnalystWorkspace />} />
                  <Route path="custody" element={<ChainOfCustody />} />
                  <Route path="audit" element={<AuditTimeline />} />
                  <Route path="findings" element={<FindingsRedirect />} />
                  <Route path="reports" element={<ReportsInterface />} />
                </Route>
              </Route>

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/cases" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
