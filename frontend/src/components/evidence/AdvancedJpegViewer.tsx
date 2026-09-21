import React, { useState } from 'react';
import { fetchApi } from '../../api';

interface AdvancedJpegViewerProps {
  evidenceId: number;
  containerFormat: string;
  structureResult?: any;
  qtResult?: any;
  huffmanResult?: any;
  onRefresh?: () => void;
}

export const AdvancedJpegViewer: React.FC<AdvancedJpegViewerProps> = ({
  evidenceId,
  containerFormat,
  structureResult,
  qtResult,
  huffmanResult,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'structure' | 'qt' | 'huffman'>('structure');
  const [runningEngine, setRunningEngine] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedQtIndex, setSelectedQtIndex] = useState<number>(0);

  const isJpeg = ['JPEG', 'JPG'].includes((containerFormat || '').toUpperCase());

  const handleRunAnalysis = async (engineSlug: string) => {
    setRunningEngine(engineSlug);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/${engineSlug}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Analysis ${engineSlug} failed.`);
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Analysis trigger failed.');
    } finally {
      setRunningEngine(null);
    }
  };

  // Guardrail for non-JPEG
  if (!isJpeg) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Advanced JPEG & File Forensics (V4 Step 2)</h3>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
            NOT APPLICABLE ({containerFormat.toUpperCase()})
          </span>
        </div>
        <div style={{ padding: '0.85rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '0.85rem' }}>
          <strong style={{ color: '#f59e0b' }}>SCIENTIFIC GUARDRAIL NOTICE:</strong>
          <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-main)', lineHeight: 1.4 }}>
            JPEG Structural, Quantization Table (DQT), and Huffman Coding (DHT) analyses operate exclusively on ITU-T T.81 JPEG byte streams.
            Container format <strong>{containerFormat.toUpperCase()}</strong> cannot be evaluated by these engines.
            Inapplicability is a methodological prerequisite, <em>NOT</em> negative evidence of manipulation or proof of authenticity.
          </p>
        </div>
      </div>
    );
  }

  // Safe extraction of structured findings
  const structFindings = structureResult?.structured_findings || {};
  const qtFindings = qtResult?.structured_findings || {};
  const huffFindings = huffmanResult?.structured_findings || {};

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Engine Trigger Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              V4 EXTENSION ENGINES
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ITU-T T.81 / ISO 10918-1</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Advanced JPEG Bitstream & Structural Forensics</h3>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="secondary-button"
            onClick={() => handleRunAnalysis('jpeg-structure')}
            disabled={runningEngine === 'jpeg-structure'}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
          >
            {runningEngine === 'jpeg-structure' ? 'Analyzing Structure...' : 'Run Structure Analysis'}
          </button>
          <button
            className="secondary-button"
            onClick={() => handleRunAnalysis('jpeg-qt')}
            disabled={runningEngine === 'jpeg-qt'}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
          >
            {runningEngine === 'jpeg-qt' ? 'Analyzing DQT...' : 'Run DQT Analysis'}
          </button>
          <button
            className="secondary-button"
            onClick={() => handleRunAnalysis('jpeg-huffman')}
            disabled={runningEngine === 'jpeg-huffman'}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
          >
            {runningEngine === 'jpeg-huffman' ? 'Analyzing DHT...' : 'Run Huffman Analysis'}
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '0.8rem', color: '#ef4444' }}>
          {actionError}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('structure')}
          style={{
            background: activeTab === 'structure' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'structure' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          📑 Marker & Structure ({structFindings.marker_sequence?.length || 0} markers)
        </button>
        <button
          onClick={() => setActiveTab('qt')}
          style={{
            background: activeTab === 'qt' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'qt' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          🔢 Quantization Tables (DQT) ({qtFindings.table_count || 0})
        </button>
        <button
          onClick={() => setActiveTab('huffman')}
          style={{
            background: activeTab === 'huffman' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'huffman' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          🌲 Huffman Coding (DHT) ({huffFindings.total_tables || 0})
        </button>
      </div>

      {/* Tab 1: Structure */}
      {activeTab === 'structure' && (
        <div>
          {!structureResult ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Structure analysis has not been executed on this evidence. Click <strong>"Run Structure Analysis"</strong> above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Dimensions & Components Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>DIMENSIONS & FRAME</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {structFindings.dimensions ? `${structFindings.dimensions.width} × ${structFindings.dimensions.height}` : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    SOF: {structFindings.sof_marker || 'N/A'} ({structFindings.precision || 8}-bit)
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>COMPONENTS</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {structFindings.components?.length || 0} Channels
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {structFindings.components?.map((c: any) => `${c.name} (${c.horizontal_sampling}x${c.vertical_sampling})`).join(', ')}
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RESTART INTERVAL (DRI)</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {structFindings.restart_interval ? `${structFindings.restart_interval} MCUs` : 'None (0)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Trailing bytes: {structFindings.trailing_bytes_count || 0}
                  </div>
                </div>
              </div>

              {/* Structural Anomalies */}
              <div style={{ background: 'var(--surface-color-light)', padding: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: structFindings.structural_anomalies?.length ? '#ef4444' : '#10b981' }}>
                  {structFindings.structural_anomalies?.length ? `⚠️ STRUCTURAL ANOMALIES OBSERVED (${structFindings.structural_anomalies.length})` : '✓ NO STRUCTURAL ANOMALIES DETECTED'}
                </div>
                {structFindings.structural_anomalies?.length ? (
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#f87171' }}>
                    {structFindings.structural_anomalies.map((an: string, idx: number) => (
                      <li key={idx}>{an}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    The marker stream conforms strictly to standard JPEG ITU-T T.81 layout without truncation, premature markers, or syntax deviations.
                  </div>
                )}
              </div>

              {/* Marker Sequence Pills */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  MARKER SEQUENCE FLOW:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {structFindings.marker_sequence?.map((m: string, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '3px',
                        background: m.startsWith('APP') ? '#1e3a8a' : (m === 'DQT' ? '#065f46' : (m === 'DHT' ? '#581c87' : '#374151')),
                        color: '#fff',
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Segments Catalog Table */}
              {structFindings.segments && structFindings.segments.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                    DETAILED SEGMENT DIRECTORY:
                  </div>
                  <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead style={{ background: 'var(--surface-color-light)', position: 'sticky', top: 0 }}>
                        <tr>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Marker</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Code</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Byte Offset</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Length</th>
                          <th style={{ padding: '0.4rem 0.6rem' }}>Segment Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structFindings.segments.map((s: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>{s.marker}</td>
                            <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace' }}>{s.code}</td>
                            <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace' }}>{s.offset} (0x{s.offset.toString(16).toUpperCase()})</td>
                            <td style={{ padding: '0.35rem 0.6rem' }}>{s.length} B</td>
                            <td style={{ padding: '0.35rem 0.6rem' }}>{s.size} B</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Quantization Tables */}
      {activeTab === 'qt' && (
        <div>
          {!qtResult ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Quantization analysis has not been executed on this evidence. Click <strong>"Run DQT Analysis"</strong> above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Quality Factor & Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ESTIMATED QUALITY FACTOR</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem', color: qtFindings.quality_estimation?.status === 'ESTIMATED' ? '#10b981' : '#f59e0b' }}>
                    {qtFindings.quality_estimation?.status === 'ESTIMATED' ? `Q ~ ${qtFindings.quality_estimation.estimated_quality_factor}` : 'NOT_ESTIMATED'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {qtFindings.quality_estimation?.status === 'ESTIMATED'
                      ? `IJG Inversion (${qtFindings.quality_estimation.match_confidence} confidence, MAD ${qtFindings.quality_estimation.mean_absolute_deviation})`
                      : (qtFindings.quality_estimation?.reason || 'Non-standard curve')}
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>EXTRACTED DQT TABLES</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {qtFindings.table_count || 0} Tables
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {qtFindings.tables?.map((t: any) => `Table ${t.table_id} (${t.precision_bits}-bit)`).join(' | ')}
                  </div>
                </div>
              </div>

              {/* Table Selector */}
              {qtFindings.tables && qtFindings.tables.length > 0 && (
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {qtFindings.tables.map((tbl: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedQtIndex(idx)}
                        style={{
                          background: selectedQtIndex === idx ? 'var(--surface-color-light)' : 'transparent',
                          border: `1px solid ${selectedQtIndex === idx ? 'var(--primary-color)' : 'var(--border-color)'}`,
                          color: selectedQtIndex === idx ? 'var(--primary-color)' : 'var(--text-muted)',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Table {tbl.table_id}: {tbl.description}
                      </button>
                    ))}
                  </div>

                  {/* Selected Table Grid & Statistics */}
                  {qtFindings.tables[selectedQtIndex] && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'start', flexWrap: 'wrap' }}>
                      {/* 8x8 Grid */}
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                          8×8 NATURAL ORDER MATRIX (ROW-MAJOR):
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(8, 38px)',
                            gridTemplateRows: 'repeat(8, 34px)',
                            gap: '3px',
                            background: 'var(--surface-color-light)',
                            padding: '6px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          {qtFindings.tables[selectedQtIndex].raw_matrix_8x8.map((row: number[], rIdx: number) =>
                            row.map((val: number, cIdx: number) => {
                              const isDc = rIdx === 0 && cIdx === 0;
                              // Heat intensity based on value 1..150
                              const heat = Math.min(val / 120.0, 1.0);
                              const bg = isDc
                                ? '#3b82f6'
                                : `rgba(16, 185, 129, ${0.15 + heat * 0.75})`;
                              return (
                                <div
                                  key={`${rIdx}-${cIdx}`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: bg,
                                    borderRadius: '3px',
                                    fontSize: '0.75rem',
                                    fontWeight: isDc ? 800 : 500,
                                    color: '#fff',
                                    fontFamily: 'monospace',
                                  }}
                                  title={`[${rIdx},${cIdx}] ${isDc ? 'DC' : 'AC'}: ${val}`}
                                >
                                  {val}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Statistics & Metadata */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>TABLE FINGERPRINT (SHA-256):</div>
                          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#60a5fa', wordBreak: 'break-all', marginTop: '0.2rem' }}>
                            {qtFindings.tables[selectedQtIndex].fingerprint_sha256}
                          </div>
                        </div>

                        <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>COMPONENT ASSOCIATIONS:</div>
                          <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                            Referenced by: <strong>{qtFindings.tables[selectedQtIndex].referenced_by_components?.join(', ') || 'Unreferenced'}</strong>
                          </div>
                        </div>

                        <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>DETERMINISTIC STATISTICS:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.75rem' }}>
                            <div>DC Coefficient: <strong>{qtFindings.tables[selectedQtIndex].statistics?.dc_coefficient}</strong></div>
                            <div>AC Min: <strong>{qtFindings.tables[selectedQtIndex].statistics?.ac?.min}</strong></div>
                            <div>AC Max: <strong>{qtFindings.tables[selectedQtIndex].statistics?.ac?.max}</strong></div>
                            <div>AC Mean: <strong>{qtFindings.tables[selectedQtIndex].statistics?.ac?.mean}</strong></div>
                            <div>AC StdDev: <strong>{qtFindings.tables[selectedQtIndex].statistics?.ac?.std_dev}</strong></div>
                            <div>AC Median: <strong>{qtFindings.tables[selectedQtIndex].statistics?.ac?.median}</strong></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Huffman Coding */}
      {activeTab === 'huffman' && (
        <div>
          {!huffmanResult ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Huffman analysis has not been executed on this evidence. Click <strong>"Run Huffman Analysis"</strong> above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TOTAL HUFFMAN TABLES</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {huffFindings.total_tables || 0} Tables
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {huffFindings.dc_count || 0} DC tables | {huffFindings.ac_count || 0} AC tables
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TABLE SPECIFICATION PROFILE</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem', color: huffFindings.custom_count === 0 ? '#10b981' : '#a855f7' }}>
                    {huffFindings.custom_count === 0 ? 'Standard Annex K' : `${huffFindings.custom_count} Custom/Optimized`}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {huffFindings.custom_count === 0 ? 'Exact ITU-T T.81 baseline' : 'Targeted entropy coding (e.g. mozjpeg/Adobe)'}
                  </div>
                </div>
              </div>

              {/* Huffman Tables List */}
              {huffFindings.tables?.map((tbl: any, idx: number) => (
                <div key={idx} style={{ background: 'var(--surface-color-light)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '3px',
                          background: tbl.table_class === 'DC' ? '#3b82f6' : '#8b5cf6',
                          color: '#fff',
                        }}
                      >
                        {tbl.table_class} Table {tbl.table_id}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{tbl.table_type}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Symbols: <strong>{tbl.total_symbols}</strong> | Code Lengths: <strong>{tbl.min_code_length} to {tbl.max_code_length} bits</strong>
                    </div>
                  </div>

                  {/* Fingerprint */}
                  <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)', marginBottom: '0.5rem', wordBreak: 'break-all' }}>
                    SHA-256: {tbl.fingerprint_sha256}
                  </div>

                  {/* Code-length distribution histogram */}
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      CODE LENGTH DISTRIBUTION (BITS 1 THROUGH 16):
                    </div>
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '60px', background: 'var(--surface-color)', padding: '4px', borderRadius: '4px' }}>
                      {tbl.code_lengths_distribution?.map((cnt: number, lenIdx: number) => {
                        const bitLen = lenIdx + 1;
                        // normalize height against max count in table
                        const maxCnt = Math.max(...(tbl.code_lengths_distribution || [1]), 1);
                        const hPct = cnt === 0 ? 4 : Math.max(12, Math.round((cnt / maxCnt) * 100));
                        return (
                          <div
                            key={lenIdx}
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              height: '100%',
                            }}
                            title={`Length ${bitLen} bits: ${cnt} codes`}
                          >
                            <div
                              style={{
                                width: '100%',
                                height: `${hPct}%`,
                                background: cnt > 0 ? (tbl.table_class === 'DC' ? '#3b82f6' : '#8b5cf6') : '#374151',
                                borderRadius: '2px 2px 0 0',
                              }}
                            />
                            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {bitLen}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedJpegViewer;
