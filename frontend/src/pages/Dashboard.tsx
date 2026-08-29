import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [cases, setCases] = useState<any[]>([]);
  const [activeCase, setActiveCase] = useState<any | null>(null);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [error, setError] = useState('');
  
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);

  const [analyzingELA, setAnalyzingELA] = useState(false);
  const [elaResult, setElaResult] = useState<any | null>(null);

  const [analyzingNoise, setAnalyzingNoise] = useState(false);
  const [noiseResult, setNoiseResult] = useState<any | null>(null);

  const [analyzingDCT, setAnalyzingDCT] = useState(false);
  const [dctResult, setDctResult] = useState<any | null>(null);

  const [analyzingCopyMove, setAnalyzingCopyMove] = useState(false);
  const [copyMoveResult, setCopyMoveResult] = useState<any | null>(null);

  const [normalizing, setNormalizing] = useState(false);
  const [fusionResult, setFusionResult] = useState<any | null>(null);

  const [correlating, setCorrelating] = useState(false);
  const [correlationResult, setCorrelationResult] = useState<any | null>(null);
  const [analysisError, setAnalysisError] = useState(false);
  const [elaError, setElaError] = useState(false);
  const [noiseError, setNoiseError] = useState(false);
  const [dctError, setDctError] = useState(false);
  const [copyMoveError, setCopyMoveError] = useState(false);
  const [fusionError, setFusionError] = useState(false);
  const [correlationError, setCorrelationError] = useState(false);


  const fetchCases = () => {
    fetch('http://localhost:8000/api/cases')
      .then(res => res.json())
      .then(data => setCases(data))
      .catch(err => console.error("Error fetching cases", err));
  };

  useEffect(() => {
    fetchCases();
  }, []);

  
  const handleRunAllAnalyses = async () => {
    if (!uploadResult) return;
    
    // Helper to run a single analysis
    const runSingle = async (url: string, setRunning: any, setResult: any, setErrorState: any) => {
        setRunning(true);
        setErrorState(false);
        try {
            const res = await fetch(url, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Analysis failed');
            setResult(data);
            setRunning(false);
            return true;
        } catch (_err) {
            setErrorState(true);
            setRunning(false);
            return false;
        }
    };

    // Sequentially run all
    await runSingle(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/metadata`, setAnalyzing, setAnalysisResult, setAnalysisError);
    await runSingle(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/ela`, setAnalyzingELA, setElaResult, setElaError);
    await runSingle(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/noise`, setAnalyzingNoise, setNoiseResult, setNoiseError);
    await runSingle(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/jpeg-dct`, setAnalyzingDCT, setDctResult, setDctError);
    await runSingle(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/copy-move`, setAnalyzingCopyMove, setCopyMoveResult, setCopyMoveError);
    
    // Run Fusion
    const normSuccess = await runSingle(`http://localhost:8000/api/evidence/${uploadResult.id}/fusion/normalize`, setNormalizing, setFusionResult, setFusionError);
    if (normSuccess) {
        await runSingle(`http://localhost:8000/api/evidence/${uploadResult.id}/fusion/correlate`, setCorrelating, setCorrelationResult, setCorrelationError);
    }
  };

  const handleCreateCase = () => {
    if (!newCaseTitle) return;
    fetch('http://localhost:8000/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newCaseTitle })
    })
      .then(res => res.json())
      .then(data => {
        setCases([...cases, data]);
        setActiveCase(data);
        setNewCaseTitle('');
        setUploadResult(null);
        setAnalysisResult(null); setAnalysisError(false);
        setElaResult(null); setElaError(false);
        setNoiseResult(null); setNoiseError(false);
        setDctResult(null); setDctError(false);
        setCopyMoveResult(null); setCopyMoveError(false);
        setFusionResult(null); setFusionError(false);
        setCorrelationResult(null); setCorrelationError(false);
      })
      .catch(err => console.error(err));
  };

  const handleUpload = () => {
    if (!file || !activeCase) return;
    setUploading(true);
    setError('');
    setUploadResult(null);
    setAnalysisResult(null); setAnalysisError(false);
    setElaResult(null); setElaError(false);
    setNoiseResult(null); setNoiseError(false);
    setDctResult(null); setDctError(false);
    setCopyMoveResult(null); setCopyMoveError(false);
    setFusionResult(null); setFusionError(false);
    setCorrelationResult(null); setCorrelationError(false);

    const formData = new FormData();
    formData.append('file', file);

    fetch(`http://localhost:8000/api/cases/${activeCase.id}/evidence`, {
      method: 'POST',
      body: formData
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Upload failed');
        setUploadResult(data);
        setUploading(false);
        setFile(null);
      })
      .catch((_err: any) => {
        setError(_err.message);
        setUploading(false);
      });
  };

  const handleAnalyze = () => {
    if (!uploadResult) return;
    setAnalyzing(true);
    setAnalysisError(false);

    fetch(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/metadata`, {
      method: 'POST'
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Analysis failed');
        setAnalysisResult(data);
        setAnalyzing(false);
      })
      .catch((_err: any) => {
        setAnalysisError(true);
        setAnalyzing(false);
      });
  };

  const handleAnalyzeELA = () => {
    if (!uploadResult) return;
    setAnalyzingELA(true);
    setElaError(false);

    fetch(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/ela`, {
      method: 'POST'
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'ELA Analysis failed');
        setElaResult(data);
        setAnalyzingELA(false);
      })
      .catch((_err: any) => {
        setElaError(true);
        setAnalyzingELA(false);
      });
  };

  const handleAnalyzeNoise = () => {
    if (!uploadResult) return;
    setAnalyzingNoise(true);
    setNoiseError(false);

    fetch(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/noise`, {
      method: 'POST'
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Noise Analysis failed');
        setNoiseResult(data);
        setAnalyzingNoise(false);
      })
      .catch((_err: any) => {
        setNoiseError(true);
        setAnalyzingNoise(false);
      });
  };

  const handleAnalyzeDCT = () => {
    if (!uploadResult) return;
    setAnalyzingDCT(true);
    setDctError(false);

    fetch(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/jpeg-dct`, {
      method: 'POST'
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'JPEG/DCT Analysis failed');
        setDctResult(data);
        setAnalyzingDCT(false);
      })
      .catch((_err: any) => {
        setDctError(true);
        setAnalyzingDCT(false);
      });
  };

  const handleAnalyzeCopyMove = () => {
    if (!uploadResult) return;
    setAnalyzingCopyMove(true);
    setCopyMoveError(false);

    fetch(`http://localhost:8000/api/evidence/${uploadResult.id}/analysis/copy-move`, {
      method: 'POST'
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Copy-Move Analysis failed');
        setCopyMoveResult(data);
        setAnalyzingCopyMove(false);
      })
      .catch((_err: any) => {
        setCopyMoveError(true);
        setAnalyzingCopyMove(false);
      });
  };

  const handleNormalize = () => {
    if (!uploadResult) return;
    setNormalizing(true);
    setFusionError(false);

    fetch(`http://localhost:8000/api/evidence/${uploadResult.id}/fusion/normalize`, {
      method: 'POST'
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Normalization failed');
        setFusionResult(data);
        setNormalizing(false);
      })
      .catch((_err: any) => {
        setFusionError(true);
        setNormalizing(false);
      });
  };

  const handleCorrelate = () => {
    if (!uploadResult) return;
    setCorrelating(true);
    setCorrelationError(false);

    fetch(`http://localhost:8000/api/evidence/${uploadResult.id}/fusion/correlate`, {
      method: 'POST'
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Correlation failed');
        setCorrelationResult(data);
        setCorrelating(false);
      })
      .catch((_err: any) => {
        setCorrelationError(true);
        setCorrelating(false);
      });
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1 className="dashboard-title">ForenSight Dashboard</h1>
        <p className="dashboard-subtitle">Digital Image Forensics • Evidence Analysis • Explainable Assessment</p>
      </div>

      <div className="placeholder-grid">
        <div className="card">
          <h2 className="card-title">Investigation Cases</h2>
          
          <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              placeholder="New Case Title" 
              value={newCaseTitle}
              onChange={e => setNewCaseTitle(e.target.value)}
              style={{ flex: 1, padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'white' }}
            />
            <button className="btn btn-primary" onClick={handleCreateCase}>Create</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {cases.length === 0 && <span style={{color: 'var(--text-muted)'}}>No cases found.</span>}
            {cases.map(c => (
              <div 
                key={c.id} 
                onClick={() => {
                    setActiveCase(c);
                    setUploadResult(null);
                    setAnalysisResult(null); setAnalysisError(false);
                    setElaResult(null); setElaError(false);
                    setNoiseResult(null); setNoiseError(false);
                    setDctResult(null); setDctError(false);
                    setCopyMoveResult(null); setCopyMoveError(false);
                    setFusionResult(null); setFusionError(false);
                    setCorrelationResult(null); setCorrelationError(false);
                }}
                style={{
                  padding: '0.75rem', 
                  borderRadius: '0.25rem', 
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: activeCase?.id === c.id ? 'var(--primary-color)' : 'var(--border-color)',
                  background: activeCase?.id === c.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                }}
              >
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.case_identifier}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Evidence Acquisition</h2>
          {!activeCase ? (
            <p style={{ color: 'var(--text-muted)' }}>Select or create a case first.</p>
          ) : (
            <div>
              <p style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Active Case: {activeCase.case_identifier}</p>
              
              <input 
                type="file" 
                accept="image/png, image/jpeg, image/webp"
                onChange={e => setFile(e.target.files?.[0] || null)}
                style={{ marginBottom: '1rem', display: 'block', width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '0.25rem', color: 'var(--text-main)' }}
              />
              
              <button 
                className="btn btn-primary" 
                onClick={handleUpload}
                disabled={!file || uploading}
                style={{ width: '100%' }}
              >
                {uploading ? 'Processing Acquisition...' : 'Securely Acquire Evidence'}
              </button>

              {error && (
                <div style={{ marginTop: '1rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {uploadResult && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h2 className="card-title" style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>SOURCE EVIDENCE INTEGRITY</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', background: 'var(--surface-color-light)', padding: '1.5rem', borderRadius: '0.5rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Evidence ID</div>
                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{uploadResult.evidence_identifier}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Acquisition Status</div>
                <div><span className="status-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)' }}>Verified & Secured</span></div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Original Filename</div>
                <div>{uploadResult.original_filename}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>MIME Type</div>
                <div>{uploadResult.mime_type}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Dimensions</div>
                <div>{uploadResult.width} x {uploadResult.height} px</div>
              </div>
              <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>SHA-256 Hash</div>
                <div style={{ fontFamily: 'monospace', background: 'var(--background-color)', padding: '0.75rem', borderRadius: '0.25rem', wordBreak: 'break-all', fontSize: '1.1rem', border: '1px solid var(--border-color)', color: '#10b981' }}>
                  {uploadResult.sha256_hash}
                </div>
              </div>
            </div>

            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0, color: 'var(--primary-color)' }}>ANALYSIS CONTROLS</h2>
              <button 
                className="btn btn-primary" 
                onClick={handleRunAllAnalyses}
                disabled={analyzing || analyzingELA || analyzingNoise || analyzingDCT || analyzingCopyMove || normalizing || correlating}
                style={{ background: 'var(--primary-color)' }}
              >
                Run Full Forensic Suite
              </button>
            </div>

            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 600 }}>Metadata</span>
                        <span style={{ fontSize: '0.8rem', color: analysisError ? '#ef4444' : analysisResult ? '#10b981' : 'var(--text-muted)' }}>
                            {analysisError ? '✗ FAILED' : analysisResult ? '✓ COMPLETED' : analyzing ? 'RUNNING...' : '○ NOT RUN'}
                        </span>
                    </div>
                    <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing || analysisResult != null}>
                      {analyzing ? 'Running...' : 'Run Analysis'}
                    </button>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 600 }}>Error Level Analysis (ELA)</span>
                        <span style={{ fontSize: '0.8rem', color: elaError ? '#ef4444' : elaResult ? '#10b981' : 'var(--text-muted)' }}>
                            {elaError ? '✗ FAILED' : elaResult ? '✓ COMPLETED' : analyzingELA ? 'RUNNING...' : '○ NOT RUN'}
                        </span>
                    </div>
                    <button className="btn btn-primary" onClick={handleAnalyzeELA} disabled={analyzingELA || elaResult != null} style={{ background: 'var(--secondary-color)' }}>
                      {analyzingELA ? 'Running ELA...' : 'Run Analysis'}
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 600 }}>Noise Residual</span>
                        <span style={{ fontSize: '0.8rem', color: noiseError ? '#ef4444' : noiseResult ? '#10b981' : 'var(--text-muted)' }}>
                            {noiseError ? '✗ FAILED' : noiseResult ? '✓ COMPLETED' : analyzingNoise ? 'RUNNING...' : '○ NOT RUN'}
                        </span>
                    </div>
                    <button className="btn btn-primary" onClick={handleAnalyzeNoise} disabled={analyzingNoise || noiseResult != null} style={{ background: '#8b5cf6' }}>
                      {analyzingNoise ? 'Running Noise...' : 'Run Analysis'}
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 600 }}>JPEG / DCT</span>
                        <span style={{ fontSize: '0.8rem', color: dctError ? '#ef4444' : dctResult ? '#10b981' : 'var(--text-muted)' }}>
                            {dctError ? '✗ FAILED' : dctResult ? '✓ COMPLETED' : analyzingDCT ? 'RUNNING...' : '○ NOT RUN'}
                        </span>
                    </div>
                    <button className="btn btn-primary" onClick={handleAnalyzeDCT} disabled={analyzingDCT || dctResult != null} style={{ background: '#f59e0b', color: 'white' }}>
                      {analyzingDCT ? 'Running DCT...' : 'Run Analysis'}
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontWeight: 600 }}>Copy-Move</span>
                        <span style={{ fontSize: '0.8rem', color: copyMoveError ? '#ef4444' : copyMoveResult ? '#10b981' : 'var(--text-muted)' }}>
                            {copyMoveError ? '✗ FAILED' : copyMoveResult ? '✓ COMPLETED' : analyzingCopyMove ? 'RUNNING...' : '○ NOT RUN'}
                        </span>
                    </div>
                    <button className="btn btn-primary" onClick={handleAnalyzeCopyMove} disabled={analyzingCopyMove || copyMoveResult != null} style={{ background: '#0ea5e9', color: 'white' }}>
                      {analyzingCopyMove ? 'Running Copy-Move...' : 'Run Analysis'}
                    </button>
                </div>
            </div>
            
            <h2 className="card-title" style={{ marginTop: '2rem', marginBottom: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>FUSION CONTROLS</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleNormalize}
                  disabled={normalizing}
                  style={{ background: '#8b5cf6', color: 'white', padding: '1rem' }}
                >
                  {normalizing ? 'Normalizing Evidence...' : '1. Normalize Observations'}
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleCorrelate}
                  disabled={correlating}
                  style={{ background: '#ec4899', color: 'white', padding: '1rem' }}
                >
                  {correlating ? 'Correlating Evidence...' : '2. Correlate & Assess'}
                </button>
            </div>
          </div>
        )}

        
        {uploadResult && !analysisResult && (
            
        <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid var(--primary-color)' }}>
            <h2 className="card-title">Metadata Forensics Analysis</h2>
            { analysisError ? (
                <div style={{ fontStyle: 'italic', color: '#ef4444', padding: '1rem' }}>Analysis failed to execute. Check console for details.</div>
            ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>No analysis has been executed for this evidence.</div>
            )}
        </div>
    
        )}
        {analysisResult && (
            
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid var(--primary-color)' }}>
            <h2 className="card-title">Metadata Forensics Analysis</h2>
            
            <div style={{ marginBottom: '1rem' }}>
                <span className="status-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)' }}>
                  Analysis ID: {analysisResult.analysis_identifier}
                </span>
                <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>Status: {analysisResult.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <strong>Method:</strong> Metadata Extraction | <strong>Configuration:</strong> Standard ExifTool parsing
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Forensic Indicators)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem' }}>
                    {analysisResult.structured_findings?.findings?.indicators?.length > 0 ? (
                        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                            {analysisResult.structured_findings.findings.indicators.map((ind: string, i: number) => (
                                <li key={i} style={{ marginBottom: '0.25rem' }}>
                                    {ind === 'POST_PROCESSING_SOFTWARE_PRESENT' && 'Post-processing software metadata detected.'}
                                    {ind === 'CAMERA_METADATA_PRESENT' && 'Camera equipment metadata present.'}
                                    {ind === 'CAPTURE_TIMESTAMP_PRESENT' && 'Original capture timestamp present.'}
                                    {ind === 'GPS_METADATA_PRESENT' && 'Geographic location data (GPS) present.'}
                                    {ind === 'EXIF_METADATA_PRESENT' && 'EXIF metadata block found.'}
                                    {ind === 'NO_EXIF_METADATA' && 'No EXIF metadata block found.'}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <span style={{ color: 'var(--text-muted)' }}>No notable forensic indicators detected.</span>
                    )}
                </div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', marginTop: '1rem' }}>5. Interpretation & 6. Limitations</h3>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>
                  <strong>Interpretation:</strong> Presence of software traces indicates prior processing. 
                  <br/><strong>Limitations:</strong> Metadata is easily stripped or modified. It is an observation, NOT proof of manipulation. Software traces do not strictly imply malicious tampering.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Extracted Properties)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Camera Make</div>
                        <div>{analysisResult.structured_findings?.findings?.camera_make || 'Unknown'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Camera Model</div>
                        <div>{analysisResult.structured_findings?.findings?.camera_model || 'Unknown'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Software</div>
                        <div>{analysisResult.structured_findings?.findings?.software_detected || 'Unknown'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Capture Time</div>
                        <div>{analysisResult.structured_findings?.findings?.capture_time || 'Unknown'}</div>
                    </div>
                </div>
              </div>
            </div>
          </div>
        
        )}
    

        
        {uploadResult && !elaResult && (
            
        <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #10b981' }}>
            <h2 className="card-title">Error Level Analysis (ELA)</h2>
            { elaError ? (
                <div style={{ fontStyle: 'italic', color: '#ef4444', padding: '1rem' }}>Analysis failed to execute. Check console for details.</div>
            ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>No analysis has been executed for this evidence.</div>
            )}
        </div>
    
        )}
        {elaResult && (
            
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #10b981' }}>
            <h2 className="card-title">Error Level Analysis (ELA)</h2>
            <div style={{ marginBottom: '1rem' }}>
                <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                  Analysis ID: {elaResult.analysis_identifier}
                </span>
                <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>Status: {elaResult.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <strong>1. Method:</strong> Error Level Analysis | <strong>2. Configuration:</strong> Dynamic JPEG Quality estimation
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Statistics)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>JPEG Quality</div>
                        <div>{elaResult.structured_findings?.jpeg_quality}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Mean Error</div>
                        <div>{elaResult.structured_findings?.mean_error?.toFixed(2)}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Median Error</div>
                        <div>{elaResult.structured_findings?.median_error?.toFixed(2)}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Max Error</div>
                        <div>{elaResult.structured_findings?.max_error?.toFixed(2)}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Standard Deviation</div>
                        <div>{elaResult.structured_findings?.std_error?.toFixed(2)}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>95th Percentile</div>
                        <div>{elaResult.structured_findings?.percentiles?.['95th']?.toFixed(2)}</div>
                    </div>
                </div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', marginTop: '1rem' }}>5. Interpretation & 6. Limitations</h3>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>
                  <strong>Interpretation:</strong> Elevated recompression error may indicate differences in image processing history. 
                  <br/><strong>Limitations:</strong> High contrast edges naturally produce higher ELA values. ELA alone does not establish image manipulation.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>4. Visualization</h3>
                {elaResult.structured_findings?.artifacts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Normalized ELA Map</div>
                            <img 
                                src={`http://localhost:8000/api/artifacts/${elaResult.structured_findings.artifacts.ela_map}`} 
                                alt="ELA Map" 
                                style={{ maxWidth: '100%', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}
                            />
                        </div>
                    </div>
                )}
              </div>
            </div>
          </div>
        
        )}
    

        
        {uploadResult && !noiseResult && (
            
        <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #8b5cf6' }}>
            <h2 className="card-title">Noise Residual Analysis</h2>
            { noiseError ? (
                <div style={{ fontStyle: 'italic', color: '#ef4444', padding: '1rem' }}>Analysis failed to execute. Check console for details.</div>
            ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>No analysis has been executed for this evidence.</div>
            )}
        </div>
    
        )}
        {noiseResult && (
            
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #8b5cf6' }}>
            <h2 className="card-title">Noise Residual Analysis</h2>
            <div style={{ marginBottom: '1rem' }}>
                <span className="status-badge" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                  Analysis ID: {noiseResult.analysis_identifier}
                </span>
                <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>Status: {noiseResult.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <strong>1. Method:</strong> Noise Residual Analysis | <strong>2. Configuration:</strong> High-pass filtering
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Global Statistics)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Filter Method</div>
                        <div>{noiseResult.structured_findings?.filter_config?.method} (Kernel {noiseResult.structured_findings?.filter_config?.kernel_size}, σ={noiseResult.structured_findings?.filter_config?.sigma})</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Mean Residual</div>
                        <div>{noiseResult.structured_findings?.global_statistics?.mean_residual !== undefined && noiseResult.structured_findings?.global_statistics?.mean_residual !== null ? noiseResult.structured_findings.global_statistics.mean_residual.toFixed(2) : 'Not available'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Median Residual</div>
                        <div>{noiseResult.structured_findings?.global_statistics?.median_residual !== undefined && noiseResult.structured_findings?.global_statistics?.median_residual !== null ? noiseResult.structured_findings.global_statistics.median_residual.toFixed(2) : 'Not available'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Max Residual</div>
                        <div>{noiseResult.structured_findings?.global_statistics?.max_residual !== undefined && noiseResult.structured_findings?.global_statistics?.max_residual !== null ? noiseResult.structured_findings.global_statistics.max_residual.toFixed(2) : 'Not available'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Standard Deviation</div>
                        <div>{noiseResult.structured_findings?.global_statistics?.std_residual !== undefined && noiseResult.structured_findings?.global_statistics?.std_residual !== null ? noiseResult.structured_findings.global_statistics.std_residual.toFixed(2) : 'Not available'}</div>
                    </div>
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>2. Configuration (Local)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Window Size</div>
                        <div>{noiseResult.structured_findings?.local_config?.window_size ? `${noiseResult.structured_findings.local_config.window_size}x${noiseResult.structured_findings.local_config.window_size} px` : 'Not available'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>Stride</div>
                        <div>{noiseResult.structured_findings?.local_config?.stride ? `${noiseResult.structured_findings.local_config.stride} px` : 'Not available'}</div>
                    </div>
                </div>
                
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', marginTop: '1rem' }}>5. Interpretation & 6. Limitations</h3>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>
                  <strong>Interpretation:</strong> Inconsistencies in noise residuals may reflect different origins of image regions. 
                  <br/><strong>Limitations:</strong> Structural detail, texture, and compression also affect noise residuals. High residual ≠ manipulation.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>4. Visualization</h3>
                {noiseResult.structured_findings?.artifacts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Global Noise Residual Map</div>
                            <img 
                                src={`http://localhost:8000/api/artifacts/${noiseResult.structured_findings.artifacts.noise_residual_map}`} 
                                alt="Global Residual Map" 
                                style={{ maxWidth: '100%', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}
                            />
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Local Residual Magnitude Map</div>
                            <img 
                                src={`http://localhost:8000/api/artifacts/${noiseResult.structured_findings.artifacts.noise_local_map}`} 
                                alt="Local Residual Map" 
                                style={{ maxWidth: '100%', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}
                            />
                        </div>
                    </div>
                )}
              </div>
            </div>
          </div>
        
        )}
    

        
        {uploadResult && !dctResult && (
            
        <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #f59e0b' }}>
            <h2 className="card-title">JPEG / DCT Forensics</h2>
            { dctError ? (
                <div style={{ fontStyle: 'italic', color: '#ef4444', padding: '1rem' }}>Analysis failed to execute. Check console for details.</div>
            ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>No analysis has been executed for this evidence.</div>
            )}
        </div>
    
        )}
        {dctResult && (
            
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #f59e0b' }}>
            <h2 className="card-title">JPEG / DCT Forensics</h2>
            <div style={{ marginBottom: '1rem' }}>
                <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                  Analysis ID: {dctResult.analysis_identifier}
                </span>
                <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>Status: {dctResult.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <strong>1. Method:</strong> JPEG DCT Analysis | <strong>2. Configuration:</strong> LibJPEG structural extraction
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (JPEG Structure)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Format</div>
                        <div>{dctResult.structured_findings?.jpeg_format}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Dimensions</div>
                        <div>{dctResult.structured_findings?.image_width} x {dctResult.structured_findings?.image_height}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Total Blocks</div>
                        <div>{dctResult.structured_findings?.total_blocks}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Quantization Tables</div>
                        <div>{dctResult.structured_findings?.quantization_tables?.length || 0} extracted</div>
                    </div>
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (DCT Statistics)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>DC Mean</div>
                        <div>{dctResult.structured_findings?.dc_statistics?.mean !== undefined && dctResult.structured_findings?.dc_statistics?.mean !== null ? dctResult.structured_findings.dc_statistics.mean.toFixed(2) : 'Not available'}</div>
                        <div style={{ color: 'var(--text-muted)' }}>DC Std Dev</div>
                        <div>{dctResult.structured_findings?.dc_statistics?.std !== undefined && dctResult.structured_findings?.dc_statistics?.std !== null ? dctResult.structured_findings.dc_statistics.std.toFixed(2) : 'Not available'}</div>
                        
                        <div style={{ color: 'var(--text-muted)' }}>AC Mean Abs</div>
                        <div>{dctResult.structured_findings?.ac_statistics?.mean_abs !== undefined && dctResult.structured_findings?.ac_statistics?.mean_abs !== null ? dctResult.structured_findings.ac_statistics.mean_abs.toFixed(2) : 'Not available'}</div>
                        <div style={{ color: 'var(--text-muted)' }}>AC Zero Proportion</div>
                        <div>{dctResult.structured_findings?.ac_statistics?.zero_proportion !== undefined && dctResult.structured_findings?.ac_statistics?.zero_proportion !== null ? `${(dctResult.structured_findings.ac_statistics.zero_proportion * 100).toFixed(1)}%` : 'Not available'}</div>
                    </div>
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Frequency Bands)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Low Frequency Energy</div>
                        <div>{dctResult.structured_findings?.band_statistics?.low_freq_energy?.toFixed(2)}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Mid Frequency Energy</div>
                        <div>{dctResult.structured_findings?.band_statistics?.mid_freq_energy?.toFixed(2)}</div>
                        <div style={{ color: 'var(--text-muted)' }}>High Frequency Energy</div>
                        <div>{dctResult.structured_findings?.band_statistics?.high_freq_energy?.toFixed(2)}</div>
                    </div>
                </div>
                
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', marginTop: '1rem' }}>5. Interpretation & 6. Limitations</h3>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>
                  <strong>Interpretation:</strong> JPEG frequency-domain characteristics reflect the compression pipeline. 
                  <br/><strong>Limitations:</strong> Influenced heavily by compression quality, recompression, and resizing. Anomalies are not strict proof of manipulation.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>2. Configuration (Quantization Tables)</h3>
                {dctResult.structured_findings?.quantization_tables?.map((qt: any, index: number) => (
                    <div key={index} style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Table {qt.table_index}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div style={{ color: 'var(--text-muted)' }}>Mean Value</div>
                            <div>{qt.mean_val?.toFixed(2)}</div>
                            <div style={{ color: 'var(--text-muted)' }}>Max Value</div>
                            <div>{qt.max_val}</div>
                        </div>
                    </div>
                ))}
                
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>4. Visualization</h3>
                {dctResult.structured_findings?.artifacts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Global Average DCT Energy Map</div>
                            <img 
                                src={`http://localhost:8000/api/artifacts/${dctResult.structured_findings.artifacts.dct_energy_map}`} 
                                alt="Global DCT Energy Map" 
                                style={{ maxWidth: '100%', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}
                            />
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Average magnitude of DCT coefficients across image blocks.</div>
                        </div>
                    </div>
                )}
              </div>
            </div>
          </div>
        
        )}
    

        
        {uploadResult && !copyMoveResult && (
            
        <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #0ea5e9' }}>
            <h2 className="card-title">Copy-Move Analysis</h2>
            { copyMoveError ? (
                <div style={{ fontStyle: 'italic', color: '#ef4444', padding: '1rem' }}>Analysis failed to execute. Check console for details.</div>
            ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>No analysis has been executed for this evidence.</div>
            )}
        </div>
    
        )}
        {copyMoveResult && (
            
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #0ea5e9' }}>
            <h2 className="card-title">Copy-Move Analysis</h2>
            <div style={{ marginBottom: '1rem' }}>
                <span className="status-badge" style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
                  Analysis ID: {copyMoveResult.analysis_identifier}
                </span>
                <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>Status: {copyMoveResult.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <strong>1. Method:</strong> Copy-Move Forgery Detection | <strong>2. Configuration:</strong> SIFT keypoints with RANSAC
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Feature Detection)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Detector</div>
                        <div>{copyMoveResult.structured_findings?.config?.detector}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Keypoints Detected</div>
                        <div>{copyMoveResult.structured_findings?.feature_statistics?.keypoints_detected}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Descriptors Generated</div>
                        <div>{copyMoveResult.structured_findings?.feature_statistics?.descriptors_generated}</div>
                    </div>
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Matching)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>Raw Matches</div>
                        <div>{copyMoveResult.structured_findings?.matching_statistics?.raw_matches}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Ratio-Filtered Matches</div>
                        <div>{copyMoveResult.structured_findings?.matching_statistics?.ratio_filtered_matches}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Spatially-Filtered Matches</div>
                        <div>{copyMoveResult.structured_findings?.matching_statistics?.spatially_filtered_matches}</div>
                    </div>
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Geometric Verification)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ color: 'var(--text-muted)' }}>RANSAC Model</div>
                        <div>{copyMoveResult.structured_findings?.geometry?.transformation_type}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Geometric Inliers</div>
                        <div>{copyMoveResult.structured_findings?.matching_statistics?.geometric_inliers}</div>
                        <div style={{ color: 'var(--text-muted)' }}>Inlier Ratio</div>
                        <div>{(copyMoveResult.structured_findings?.matching_statistics?.inlier_ratio * 100)?.toFixed(1)}%</div>
                        <div style={{ color: 'var(--text-muted)' }}>Displacement Vector</div>
                        <div>
                            {copyMoveResult.structured_findings?.geometry?.displacement 
                                ? `[${copyMoveResult.structured_findings.geometry.displacement[0].toFixed(1)}, ${copyMoveResult.structured_findings.geometry.displacement[1].toFixed(1)}]`
                                : 'None'
                            }
                        </div>
                    </div>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>3. Measurements (Candidate Regions)</h3>
                <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    {copyMoveResult.structured_findings?.matching_statistics?.geometric_inliers > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <div style={{ color: 'var(--text-muted)' }}>Source Centroid</div>
                            <div>
                                {copyMoveResult.structured_findings?.geometry?.source_centroid 
                                    ? `(${copyMoveResult.structured_findings.geometry.source_centroid[0].toFixed(1)}, ${copyMoveResult.structured_findings.geometry.source_centroid[1].toFixed(1)})`
                                    : 'N/A'
                                }
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>Destination Centroid</div>
                            <div>
                                {copyMoveResult.structured_findings?.geometry?.destination_centroid 
                                    ? `(${copyMoveResult.structured_findings.geometry.destination_centroid[0].toFixed(1)}, ${copyMoveResult.structured_findings.geometry.destination_centroid[1].toFixed(1)})`
                                    : 'N/A'
                                }
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>Supporting Matches</div>
                            <div>{copyMoveResult.structured_findings?.candidate_regions?.supporting_matches}</div>
                        </div>
                    ) : (
                        <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                            No geometrically consistent candidate correspondence identified.
                        </div>
                    )}
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>4. Visualization</h3>
                {copyMoveResult.structured_findings?.artifacts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Candidate Copy-Move Correspondences</div>
                            <img 
                                src={`http://localhost:8000/api/artifacts/${copyMoveResult.structured_findings.artifacts.copymove_map}`} 
                                alt="Candidate Copy-Move Correspondences" 
                                style={{ maxWidth: '100%', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}
                            />
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                Lines represent geometrically consistent local feature correspondences identified within the same image.
                            </div>
                        </div>
                    </div>
                )}
              </div>
            </div>
            
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', marginTop: '1rem' }}>5. Interpretation & 6. Limitations</h3>
                <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#0ea5e9', padding: '1rem', background: 'rgba(14, 165, 233, 0.05)', borderRadius: '0.5rem' }}>
                  <strong>Interpretation:</strong> Geometrically consistent local feature correspondences may indicate duplicated regions.
                  <br/><strong>Limitations:</strong> Repeated natural structures, textures, and architectural patterns can produce false positives. Does not independently establish image manipulation.
                </p>
          </div>
        
        )}
    

        {uploadResult && !fusionResult && (
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #8b5cf6' }}>
            <h2 className="card-title">Evidence Normalization & Observations</h2>
            { fusionError ? (
                <div style={{ fontStyle: 'italic', color: '#ef4444', padding: '1rem' }}>Normalization failed.</div>
            ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>No canonical observations generated. Run analysis modules first.</div>
            )}
          </div>
        )}
        {fusionResult && (
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #8b5cf6' }}>
            <h2 className="card-title">Evidence Normalization & Observations</h2>
            
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <strong>Present Modalities:</strong> {fusionResult.modalities_present.join(', ') || 'None'}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <strong>Missing Modalities:</strong> {fusionResult.modalities_missing.join(', ') || 'None'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {fusionResult.observations.map((obs: any) => (
                <div key={obs.id} style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className="status-badge" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                      {obs.modality}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reliability: {obs.technical_reliability}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Observation</div>
                    <div style={{ fontWeight: 500 }}>{obs.observation_type}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Metric</div>
                    <div>{obs.metric_name}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Raw Value</div>
                    <div>{obs.raw_value}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Normalized Value</div>
                    <div>{obs.normalized_value !== null ? obs.normalized_value.toFixed(4) : 'N/A'}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Direction</div>
                    <div>{obs.direction}</div>
                    <div style={{ color: 'var(--text-muted)', gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                      <strong>Interpretation:</strong> {obs.interpretation}
                    </div>
                    <div style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                      <strong>Limitation:</strong> {obs.limitations}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {fusionResult.observations.length === 0 && (
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>
                No canonical observations generated. Run analysis modules first.
              </div>
            )}
            
            <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#8b5cf6', padding: '1rem', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '0.5rem' }}>
                <strong>Important:</strong> Multiple forensic observations were recorded and are available for contextual correlation. These normalized facts represent measurements, not probabilistic verdicts. 
            </p>
          </div>
        )}

        {uploadResult && !correlationResult && (
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #ec4899' }}>
            <h2 className="card-title">Evidence Correlation & Assessment</h2>
            { correlationError ? (
                <div style={{ fontStyle: 'italic', color: '#ef4444', padding: '1rem' }}>Correlation failed.</div>
            ) : (
                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', padding: '1rem' }}>Correlation not executed yet.</div>
            )}
          </div>
        )}
        {correlationResult && (
          <div className="card" style={{ gridColumn: '1 / -1', borderLeft: '4px solid #ec4899' }}>
            <h2 className="card-title">Evidence Correlation & Assessment</h2>
            
            <div style={{ marginBottom: '1.5rem', background: 'var(--surface-color-light)', padding: '1.5rem', borderRadius: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Forensic Assessment</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ec4899', marginTop: '0.25rem' }}>
                            {correlationResult.assessment.level.replace(/_/g, ' ')}
                        </div>
                    </div>
                    <div className="status-badge" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                        Rule v{correlationResult.assessment.rule_version}
                    </div>
                </div>
                <div style={{ marginTop: '1rem', fontSize: '1rem', lineHeight: '1.5' }}>
                    {correlationResult.assessment.summary}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Evidence Families</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {correlationResult.families.map((f: string) => (
                            <span key={f} style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '0.5rem 1rem', borderRadius: '2rem', fontSize: '0.875rem', fontWeight: 500 }}>
                                {f}
                            </span>
                        ))}
                        {correlationResult.families.length === 0 && (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No families active.</span>
                        )}
                    </div>

                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', marginTop: '2rem' }}>Relationships</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {correlationResult.relations.map((rel: any) => (
                            <div key={rel.id} style={{ borderLeft: '3px solid #ec4899', paddingLeft: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rel.relation_type}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>{rel.strength}</span>
                                </div>
                                <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>{rel.explanation}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><strong>Limitation:</strong> {rel.limitations}</div>
                            </div>
                        ))}
                        {correlationResult.relations.length === 0 && (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No significant relationships established between available observations.</span>
                        )}
                    </div>
                </div>

                <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Contributing Evidence</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {correlationResult.assessment.contributing_observations.map((obs: any) => (
                            <div key={obs.id} style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.9rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <strong style={{ color: 'var(--text-main)' }}>{obs.modality}</strong>
                                    <span style={{ color: '#ec4899' }}>{obs.direction}</span>
                                </div>
                                <div style={{ color: 'var(--text-muted)' }}>{obs.metric}: {obs.raw_value}</div>
                            </div>
                        ))}
                        {correlationResult.assessment.contributing_observations.length === 0 && (
                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No anomalous contributing observations.</span>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '0.5rem' }}>
                <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.5rem' }}>Scientific Limitation Warning</strong>
                <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem', fontWeight: 500 }}>
                    The assessment indicates the degree of forensic follow-up warranted by the available observations. It is not a probability of manipulation.
                </p>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem', color: '#991b1b', fontSize: '0.875rem' }}>
                    {correlationResult.assessment.limitations.map((lim: string, idx: number) => (
                        <li key={idx} style={{ marginBottom: '0.25rem' }}>{lim}</li>
                    ))}
                </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
