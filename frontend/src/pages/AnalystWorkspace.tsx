import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';

interface Finding {
  id: number;
  finding_identifier: string;
  evidence_id?: number;
  correlation_rule_id?: string;
  finding_type: string;
  severity_label: string;
  title: string;
  summary: string;
  interpretation?: string;
  limitations?: string;
  status: string;
  reviewer?: string;
  review_timestamp?: string;
  review_note?: string;
  decision?: string;
  created_at: string;
}

interface AnalystNote {
  id: number;
  note_identifier: string;
  author: string;
  target_type: string;
  target_id: string;
  content: string;
  created_at: string;
}

interface GraphData {
  case_id: string;
  nodes: Array<{ id: string; type: string; label: string; metadata: any }>;
  edges: Array<{ source: string; target: string; type: string }>;
}

const AnalystWorkspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();

  const [activeTab, setActiveTab] = useState<'findings' | 'graph' | 'notes' | 'search'>('findings');
  
  // Findings state
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewStatus, setReviewStatus] = useState('CONFIRMED_BY_ANALYST');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Graph state
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [provenanceData, setProvenanceData] = useState<any | null>(null);
  const [graphMode, setGraphMode] = useState<'graph' | 'tree'>('graph');
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);

  // Notes state
  const [notes, setNotes] = useState<AnalystNote[]>([]);
  const [targetType, setTargetType] = useState('EVIDENCE');
  const [targetId, setTargetId] = useState('1');
  const [noteContent, setNoteContent] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchFindings = () => {
    setLoadingFindings(true);
    fetchApi(`/cases/${caseId}/findings`)
      .then(res => res.json())
      .then(data => {
        setFindings(Array.isArray(data) ? data : []);
        setLoadingFindings(false);
      })
      .catch(() => setLoadingFindings(false));
  };

  const fetchGraph = () => {
    setLoadingGraph(true);
    Promise.all([
      fetchApi(`/cases/${caseId}/graph`).then(r => r.json()),
      fetchApi(`/cases/${caseId}/provenance`).then(r => r.json())
    ])
      .then(([gData, pData]) => {
        setGraphData(gData);
        setProvenanceData(pData);
        setLoadingGraph(false);
      })
      .catch(() => setLoadingGraph(false));
  };

  const fetchNotes = () => {
    fetchApi(`/cases/${caseId}/notes`)
      .then(res => res.json())
      .then(data => setNotes(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    if (caseId) {
      fetchFindings();
      fetchGraph();
      fetchNotes();
    }
  }, [caseId]);

  const handleRunCorrelations = () => {
    setEvaluating(true);
    fetchApi(`/cases/${caseId}/correlations/run`, { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        setEvaluating(false);
        fetchFindings();
        fetchGraph();
      })
      .catch(() => setEvaluating(false));
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding) return;
    setSubmittingReview(true);

    fetchApi(`/cases/${caseId}/findings/${selectedFinding.finding_identifier}/review`, {
      method: 'POST',
      body: JSON.stringify({
        status: reviewStatus,
        review_note: reviewNote,
        decision: reviewStatus,
      })
    })
      .then(async res => {
        if (!res.ok) throw new Error('Failed to submit review');
        return res.json();
      })
      .then(() => {
        setSubmittingReview(false);
        setSelectedFinding(null);
        setReviewNote('');
        fetchFindings();
      })
      .catch(err => {
        alert(err.message);
        setSubmittingReview(false);
      });
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSubmittingNote(true);

    fetchApi(`/cases/${caseId}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        content: noteContent.trim(),
      })
    })
      .then(async res => {
        if (!res.ok) throw new Error('Failed to create note');
        return res.json();
      })
      .then(() => {
        setSubmittingNote(false);
        setNoteContent('');
        fetchNotes();
      })
      .catch(err => {
        alert(err.message);
        setSubmittingNote(false);
      });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);

    fetchApi(`/cases/${caseId}/search?q=${encodeURIComponent(searchQuery.trim())}`)
      .then(res => res.json())
      .then(data => {
        setSearchResults(data.hits || []);
        setSearching(false);
      })
      .catch(() => setSearching(false));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--primary-color)', textTransform: 'uppercase', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                FORENSIC INTELLIGENCE SUITE
              </span>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                ANALYST ACTIVE
              </span>
            </div>
            <h2 className="card-title" style={{ margin: 0 }}>Analyst Investigation Workspace</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Cross-modality correlation, observation graph traversal, conflict analysis, and investigative review
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button 
              className="primary-button" 
              onClick={handleRunCorrelations}
              disabled={evaluating}
            >
              {evaluating ? 'Evaluating Rules...' : 'Run Correlation Engine'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => setActiveTab('findings')}
            className={activeTab === 'findings' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Correlated Findings ({findings.length})
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={activeTab === 'graph' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Observation Graph & Provenance
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={activeTab === 'notes' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Analyst Notes ({notes.length})
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={activeTab === 'search' ? 'primary-button' : 'secondary-button'}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            Investigation Search
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: Correlated Findings Hub                                  */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'findings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Conflict Notice Banner */}
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', borderLeft: '4px solid #f59e0b', padding: '0.85rem 1rem', borderRadius: '4px', fontSize: '0.85rem' }}>
            <strong>Scientific Methodology Notice:</strong> Correlated findings represent deterministic intersection of objective observations (e.g. metadata software tags, ELA block variance, keypoint clustering). ForenSight distinguishes <em>Negative Evidence</em> (incompatible formats or absent tags) from <em>No Evidence</em>. No synthetic manipulation percentages are generated.
          </div>

          {loadingFindings ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading findings...</div>
          ) : findings.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                No correlated findings have been generated yet. Click "Run Correlation Engine" to evaluate observations against deterministic rules.
              </div>
              <button className="primary-button" onClick={handleRunCorrelations} disabled={evaluating}>
                Run Correlation Engine
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: selectedFinding ? '1fr 420px' : '1fr', gap: '1.25rem' }}>
              {/* Findings List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {findings.map(fnd => {
                  const isConflict = fnd.finding_type === 'CONFLICT_DETECTED';
                  const isReviewRequired = fnd.severity_label === 'REVIEW_REQUIRED';
                  const statusColor = fnd.status === 'CONFIRMED_BY_ANALYST' ? '#10b981' : fnd.status === 'DISMISSED' ? '#64748b' : isConflict ? '#ec4899' : isReviewRequired ? '#f59e0b' : 'var(--primary-color)';

                  return (
                    <div 
                      key={fnd.id}
                      className="card"
                      style={{ 
                        margin: 0, 
                        borderLeft: `4px solid ${statusColor}`,
                        cursor: 'pointer',
                        borderColor: selectedFinding?.id === fnd.id ? 'var(--primary-color)' : undefined
                      }}
                      onClick={() => { setSelectedFinding(fnd); setReviewStatus(fnd.status); setReviewNote(fnd.review_note || ''); }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)', background: 'var(--surface-color-light)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                              {fnd.correlation_rule_id || 'CORR-RULE'}
                            </span>
                            <span className="badge" style={{ fontSize: '0.7rem' }}>
                              {fnd.finding_type}
                            </span>
                            <span className="badge" style={{ fontSize: '0.7rem', background: statusColor, color: 'white' }}>
                              {fnd.status}
                            </span>
                          </div>
                          <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-color)' }}>{fnd.title}</h3>
                        </div>
                        <button 
                          className="secondary-button" 
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={(e) => { e.stopPropagation(); setSelectedFinding(fnd); setReviewStatus(fnd.status); setReviewNote(fnd.review_note || ''); }}
                        >
                          Review &rarr;
                        </button>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        {fnd.summary}
                      </div>

                      {fnd.interpretation && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface-color-light)', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                          <strong>Interpretation:</strong> {fnd.interpretation}
                        </div>
                      )}

                      {fnd.limitations && (
                        <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontStyle: 'italic' }}>
                          <strong>Limitation:</strong> {fnd.limitations}
                        </div>
                      )}

                      {fnd.reviewer && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Reviewed by <strong>{fnd.reviewer}</strong> ({fnd.decision}) • {new Date(fnd.review_timestamp || '').toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Review Sidebar */}
              {selectedFinding && (
                <div className="card" style={{ height: 'fit-content', position: 'sticky', top: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Analyst Review Decision</h3>
                    <button 
                      onClick={() => setSelectedFinding(null)} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={{ fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
                    Finding: <strong style={{ color: 'var(--text-color)' }}>{selectedFinding.finding_identifier}</strong>
                  </div>

                  <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                        REVIEW DECISION / STATE
                      </label>
                      <select 
                        value={reviewStatus}
                        onChange={e => setReviewStatus(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                      >
                        <option value="ACKNOWLEDGED">ACKNOWLEDGED (Noted, further review required)</option>
                        <option value="CONFIRMED_BY_ANALYST">CONFIRMED_BY_ANALYST (Concur with technical indicators)</option>
                        <option value="DISMISSED">DISMISSED (Innocent explanation / Non-relevant)</option>
                        <option value="INCONCLUSIVE">INCONCLUSIVE (Ambiguous technical markers)</option>
                        <option value="REVIEW_REQUIRED">REVIEW_REQUIRED (Reset to pending)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-muted)' }}>
                        EXPLANATORY ANALYST REVIEW NOTE
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Document your technical rationale, reference observations, or external context..."
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        type="submit" 
                        className="primary-button" 
                        style={{ flex: 1 }}
                        disabled={submittingReview}
                      >
                        {submittingReview ? 'Recording...' : 'Record Review'}
                      </button>
                      <button 
                        type="button" 
                        className="secondary-button" 
                        onClick={() => setSelectedFinding(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: Observation Graph & Provenance                          */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'graph' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={graphMode === 'graph' ? 'primary-button' : 'secondary-button'}
                  onClick={() => setGraphMode('graph')}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Observation Network Graph
                </button>
                <button
                  className={graphMode === 'tree' ? 'primary-button' : 'secondary-button'}
                  onClick={() => setGraphMode('tree')}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Hierarchical Provenance Tree
                </button>
              </div>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {graphData ? `${graphData.nodes.length} Nodes • ${graphData.edges.length} Edges` : ''}
              </span>
            </div>

            {loadingGraph ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading observation graph...</div>
            ) : graphMode === 'graph' && graphData ? (
              <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 340px' : '1fr', gap: '1rem' }}>
                {/* SVG Graph View */}
                <div style={{ background: '#0a0d14', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', minHeight: '450px', overflowX: 'auto' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '3px', background: '#3b82f6', color: 'white' }}>CASE</span>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '3px', background: '#10b981', color: 'white' }}>EVIDENCE</span>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '3px', background: '#8b5cf6', color: 'white' }}>ANALYSIS</span>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '3px', background: '#ec4899', color: 'white' }}>OBSERVATION</span>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '3px', background: '#f59e0b', color: 'white' }}>FINDING</span>
                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '3px', background: '#06b6d4', color: 'white' }}>REPORT</span>
                  </div>

                  {/* Grid of Nodes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    {graphData.nodes.map(n => {
                      const color = n.type === 'CASE' ? '#3b82f6' : n.type === 'EVIDENCE' ? '#10b981' : n.type === 'ANALYSIS' ? '#8b5cf6' : n.type === 'OBSERVATION' ? '#ec4899' : n.type === 'FINDING' ? '#f59e0b' : '#06b6d4';
                      const isSelected = selectedNode?.id === n.id;

                      return (
                        <div
                          key={n.id}
                          onClick={() => setSelectedNode(n)}
                          style={{
                            border: `2px solid ${isSelected ? 'white' : color}`,
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '6px',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color, textTransform: 'uppercase' }}>
                              {n.type}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {n.id}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)', wordBreak: 'break-word' }}>
                            {n.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Relationships summary */}
                  <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <strong>Active Edges ({graphData.edges.length}):</strong>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {graphData.edges.map((e, idx) => (
                        <span key={idx} style={{ background: 'var(--surface-color-light)', padding: '0.2rem 0.5rem', borderRadius: '3px' }}>
                          <code>{e.source}</code> &rarr; <strong>{e.type}</strong> &rarr; <code>{e.target}</code>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Node Inspector Sidebar */}
                {selectedNode && (
                  <div className="card" style={{ height: 'fit-content' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0 }}>Node Inspector</h4>
                      <button onClick={() => setSelectedNode(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>&times;</button>
                    </div>
                    <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      <strong>Type:</strong> <span className="badge">{selectedNode.type}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      <strong>Label:</strong> {selectedNode.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      <strong>ID:</strong> <code>{selectedNode.id}</code>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Metadata:</div>
                    <pre style={{ background: '#0d1117', color: '#58a6ff', padding: '0.6rem', borderRadius: '4px', fontSize: '0.75rem', overflowX: 'auto' }}>
                      {JSON.stringify(selectedNode.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : provenanceData ? (
              /* Provenance Tree View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {provenanceData.root_evidence?.map((ev: any) => (
                  <div key={ev.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem', background: 'var(--surface-color-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>ORIGINAL EVIDENCE</span>
                      <strong>{ev.label}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({ev.details?.mime_type})</span>
                    </div>

                    <div style={{ paddingLeft: '1.5rem', borderLeft: '2px solid var(--border-color)', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {ev.children?.map((ch: any) => (
                        <div key={ch.id} style={{ background: 'var(--background-color)', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
                            <span style={{ color: ch.type === 'HASH_SIGNATURE' ? '#10b981' : ch.type === 'ANALYSIS' ? '#8b5cf6' : '#f59e0b' }}>
                              [{ch.type}]
                            </span>
                            {ch.label}
                          </div>

                          {ch.children && ch.children.length > 0 && (
                            <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--border-color)', marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {ch.children.map((sub: any) => (
                                <div key={sub.id} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  &bull; <strong style={{ color: 'var(--text-main)' }}>{sub.label}</strong>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: Analyst Notes Stream                                   */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'notes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem' }}>
          {/* Notes List */}
          <div className="card">
            <h3 className="card-title">Case Investigative Notes ({notes.length})</h3>

            {notes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No analyst notes recorded for this case yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {notes.map(n => (
                  <div key={n.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.85rem', background: 'var(--surface-color-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge" style={{ fontSize: '0.7rem' }}>
                          {n.target_type} #{n.target_id}
                        </span>
                        <strong style={{ fontSize: '0.85rem' }}>{n.author}</strong>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>
                      {n.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Note Form */}
          <div className="card" style={{ height: 'fit-content' }}>
            <h3 className="card-title">Add Analyst Note</h3>
            <form onSubmit={handleCreateNote} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Target Entity
                </label>
                <select
                  value={targetType}
                  onChange={e => setTargetType(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                >
                  <option value="EVIDENCE">Evidence Item</option>
                  <option value="ANALYSIS">Analysis Engine</option>
                  <option value="FINDING">Correlated Finding</option>
                  <option value="CASE">Case General</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Target ID / Identifier
                </label>
                <input 
                  type="text"
                  value={targetId}
                  onChange={e => setTargetId(e.target.value)}
                  placeholder="e.g. 1, FS-FND-XXXX..."
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Note Content
                </label>
                <textarea
                  rows={4}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="Write investigative observations, hypothesis, or interview notes..."
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                />
              </div>

              <button type="submit" className="primary-button" disabled={submittingNote || !noteContent.trim()}>
                {submittingNote ? 'Saving...' : 'Post Note'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: Investigation Search                                   */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'search' && (
        <div className="card">
          <h3 className="card-title">Case-Scoped Investigation Search</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Full-text search across evidence, jobs, analyses, correlated findings, analyst notes, and generated reports.
          </div>

          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input 
              type="text"
              placeholder="Search across filename, hash, job ID, rule, note content..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '0.6rem 0.8rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
            />
            <button type="submit" className="primary-button" disabled={searching || !searchQuery.trim()}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {searchResults.map((hit, idx) => (
                <div key={idx} style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.75rem', background: 'var(--surface-color-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge" style={{ fontSize: '0.7rem' }}>{hit.entity_type}</span>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--primary-color)' }}>{hit.title}</strong>
                    </div>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{hit.entity_id}</code>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                    {hit.snippet}
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery && !searching ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              No matches found for query "{searchQuery}" in this case.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default AnalystWorkspace;
