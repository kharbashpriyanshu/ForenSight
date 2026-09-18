import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';

interface GraphNode {
  id: string;
  type: string;
  label: string;
  metadata: any;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  case_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const TYPE_COLORS: Record<string, string> = {
  CASE: '#3b82f6',
  EVIDENCE: '#10b981',
  ANALYSIS_JOB: '#6b7280',
  ANALYSIS: '#8b5cf6',
  ARTIFACT: '#ec4899',
  OBSERVATION: '#f59e0b',
  FINDING: '#ef4444',
  REPORT: '#06b6d4',
};

const InvestigationGraphPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const fetchGraph = () => {
    setLoading(true);
    fetchApi(`/cases/${caseId}/graph`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch investigation observation graph');
        return res.json();
      })
      .then(data => {
        setGraphData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGraph();
  }, [caseId]);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Constructing multi-tier investigation observation graph...</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!graphData) return null;

  const filteredNodes = graphData.nodes.filter(n => {
    if (filterType !== 'ALL' && n.type !== filterType) return false;
    if (searchQuery.trim() && !n.label.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const nodeTypes = Array.from(new Set(graphData.nodes.map(n => n.type)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: 'calc(100vh - 120px)' }}>
      {/* Header bar */}
      <div className="card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                Forensic Knowledge Graph
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {graphData.nodes.length} Nodes • {graphData.edges.length} Relational Edges
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Investigation Observation Graph</h1>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input 
              type="text"
              placeholder="Search graph nodes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-color)' }}
            />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-color)' }}
            >
              <option value="ALL">All Types ({graphData.nodes.length})</option>
              {nodeTypes.map(t => (
                <option key={t} value={t}>{t} ({graphData.nodes.filter(n => n.type === t).length})</option>
              ))}
            </select>
            <button className="secondary-button" onClick={fetchGraph} style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}>
              🔄 Reload
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Area: Graph Canvas + Detail Drawer */}
      <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Node Grid / Flow Visualizer */}
        <div className="card" style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {filteredNodes.map(node => {
              const color = TYPE_COLORS[node.type] || '#6b7280';
              const isSelected = selectedNode?.id === node.id;
              return (
                <div 
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  style={{ 
                    background: isSelected ? 'var(--surface-color-light)' : 'var(--background-color)',
                    border: `1.5px solid ${isSelected ? color : 'var(--border-color)'}`,
                    borderLeft: `4px solid ${color}`,
                    borderRadius: '6px',
                    padding: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: color, textTransform: 'uppercase' }}>
                      {node.type}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {node.id.split(':')[0]}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.label}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Click to inspect relational connections &rarr;
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Slide-out Inspector Drawer */}
        <div className="card" style={{ width: '360px', overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {selectedNode ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: 800, 
                    color: TYPE_COLORS[selectedNode.type] || '#6b7280',
                    background: 'var(--surface-color-light)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    textTransform: 'uppercase'
                  }}>
                    {selectedNode.type} NODE
                  </span>
                  <h3 style={{ margin: '0.5rem 0 0.2rem', fontSize: '1.1rem', color: 'var(--text-color)' }}>
                    {selectedNode.label}
                  </h3>
                  <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{selectedNode.id}</code>
                </div>
                <button 
                  onClick={() => setSelectedNode(null)} 
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  &times;
                </button>
              </div>

              {/* Metadata */}
              <div>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Node Metadata
                </h4>
                <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem' }}>
                  {Object.keys(selectedNode.metadata || {}).length === 0 ? (
                    <div style={{ color: 'var(--text-muted)' }}>No additional metadata recorded.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {Object.entries(selectedNode.metadata).map(([k, v]) => (
                          <tr key={k} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.3rem 0', fontWeight: 600, color: 'var(--text-muted)' }}>{k}</td>
                            <td style={{ padding: '0.3rem 0', textAlign: 'right', color: 'var(--text-color)', wordBreak: 'break-all' }}>{String(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Connected Ingress/Egress Edges */}
              <div>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Connected Relational Edges
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
                  {graphData.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).map((e, idx) => (
                    <div key={idx} style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontWeight: 700, color: '#3b82f6' }}>{e.type}</span>: {e.source === selectedNode.id ? `&rarr; ${e.target}` : `&larr; from ${e.source}`}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 'auto', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px dashed var(--border-color)', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Forensic Graph Note: Edges establish provenance chains and deterministic correlation links between evidence and observations.
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem', fontSize: '0.85rem' }}>
              <div>🕸️</div>
              <div style={{ fontWeight: 600, marginTop: '0.5rem' }}>No Node Selected</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Click any node in the graph matrix to inspect its metadata, cryptographic hashes, and provenance edges.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvestigationGraphPage;
