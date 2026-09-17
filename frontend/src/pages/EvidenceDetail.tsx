import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';
import EvidenceIntegrityCard from '../components/evidence/EvidenceIntegrityCard';
import AnalysisJobCard from '../components/evidence/AnalysisJobCard';

export default function EvidenceDetail() {
  const { caseId, evidenceId } = useParams<{ caseId: string, evidenceId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [error, setError] = useState('');
  
  const [jobs, setJobs] = useState<any>({});
  const [results, setResults] = useState<any>({});

  const [normalizing, setNormalizing] = useState(false);
  const [correlating, setCorrelating] = useState(false);

  useEffect(() => {
    if (evidenceId && evidenceId !== 'new') {
        fetchApi(`/evidence/${evidenceId}`)
          .then(res => res.json())
          .then(data => setUploadResult(data))
          .catch(err => console.error("Error fetching evidence", err));

        fetchApi(`/evidence/${evidenceId}/jobs`)
          .then(res => res.json())
          .then((jobsList: any[]) => {
            if (Array.isArray(jobsList)) {
              const jobsMap: any = {};
              jobsList.forEach(j => {
                const key = j.analysis_type.toLowerCase();
                jobsMap[key] = j;
                if (j.status === 'COMPLETED' && j.analysis_id) {
                  fetchApi(`/analysis/${j.analysis_id}`)
                    .then(r => r.json())
                    .then(resData => {
                      setResults((prev: any) => ({ ...prev, [key]: resData }));
                    })
                    .catch(() => {});
                }
              });
              setJobs(jobsMap);
            }
          })
          .catch(err => console.error("Error fetching jobs", err));
    }
  }, [evidenceId]);

  const runAsyncJob = async (analysisType: string) => {
      try {
          const res = await fetchApi(`/jobs/analysis/${uploadResult.id}/${analysisType}`, { method: 'POST' });
          const jobData = await res.json();
          if (!res.ok) throw new Error(jobData.detail || 'Failed to queue job');
          
          setJobs((prev: any) => ({ ...prev, [analysisType]: jobData }));

          let isComplete = jobData.status === 'COMPLETED' || jobData.status === 'FAILED';
          let finalJob = jobData;
          while (!isComplete) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              const pollRes = await fetchApi(`/jobs/${finalJob.id}`);
              finalJob = await pollRes.json();
              setJobs((prev: any) => ({ ...prev, [analysisType]: finalJob }));
              
              if (finalJob.status === 'COMPLETED' || finalJob.status === 'FAILED') {
                  isComplete = true;
              }
          }
          
          if (finalJob.status === 'COMPLETED' && finalJob.analysis_id) {
              const resultRes = await fetchApi(`/analysis/${finalJob.analysis_id}`);
              const resultData = await resultRes.json();
              setResults((prev: any) => ({ ...prev, [analysisType]: resultData }));
          }
      } catch (err: any) {
          console.error(err);
      }
  };

  const handleUpload = () => {
    if (!file || !caseId) return;
    setUploading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('case_id', caseId || '');
    formData.append('file', file);

    fetchApi(`/cases/${caseId}/evidence`, {
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

  const handleNormalize = () => {
    if (!uploadResult) return;
    setNormalizing(true);
    fetchApi(`/evidence/${uploadResult.id}/fusion/normalize`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        setResults((prev: any) => ({ ...prev, normalize: data }));
        setNormalizing(false);
      })
      .catch(() => setNormalizing(false));
  };

  const handleCorrelate = () => {
    if (!uploadResult) return;
    setCorrelating(true);
    fetchApi(`/evidence/${uploadResult.id}/fusion/correlate`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        setResults((prev: any) => ({ ...prev, correlate: data }));
        setCorrelating(false);
      })
      .catch(() => setCorrelating(false));
  };

  return (
    <div>
      <div className="placeholder-grid">
        {!uploadResult && (
            <div className="card">
              <h2 className="card-title">Evidence Acquisition</h2>
              {!caseId ? (
                <p style={{ color: 'var(--text-muted)' }}>No Case ID found.</p>
              ) : (
                <div>
                  <p style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Active Case: {caseId}</p>
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/webp"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    style={{ marginBottom: '1rem', display: 'block', width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '0.25rem', color: 'var(--text-main)' }}
                  />
                  <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading} style={{ width: '100%' }}>
                    {uploading ? 'Processing Acquisition...' : 'Securely Acquire Evidence'}
                  </button>
                  {error && <div style={{ marginTop: '1rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>{error}</div>}
                </div>
              )}
            </div>
        )}

        <EvidenceIntegrityCard evidence={uploadResult} />

        {uploadResult && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0, color: 'var(--primary-color)' }}>ANALYSIS JOBS (ASYNC WORKLOAD)</h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <AnalysisJobCard job={jobs['metadata']} analysisType="Metadata" result={results['metadata']} onRun={() => runAsyncJob('metadata')} disabled={false} />
                <AnalysisJobCard job={jobs['ela']} analysisType="Error Level Analysis" result={results['ela']} onRun={() => runAsyncJob('ela')} disabled={false} />
                <AnalysisJobCard job={jobs['noise']} analysisType="Noise Residual" result={results['noise']} onRun={() => runAsyncJob('noise')} disabled={false} />
                <AnalysisJobCard job={jobs['jpeg-dct']} analysisType="JPEG / DCT" result={results['jpeg-dct']} onRun={() => runAsyncJob('jpeg-dct')} disabled={false} />
                <div style={{ gridColumn: '1 / -1' }}>
                    <AnalysisJobCard job={jobs['copy-move']} analysisType="Copy-Move" result={results['copy-move']} onRun={() => runAsyncJob('copy-move')} disabled={false} />
                </div>
            </div>
            
            <h2 className="card-title" style={{ marginTop: '2rem', marginBottom: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>FUSION & ASSESSMENT</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleNormalize}
                  disabled={normalizing}
                  style={{ background: '#8b5cf6', color: 'white', padding: '1rem' }}
                >
                  {normalizing ? 'Normalizing Observations...' : '1. Normalize Observations'}
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleCorrelate}
                  disabled={correlating}
                  style={{ background: '#ec4899', color: 'white', padding: '1rem' }}
                >
                  {correlating ? 'Correlating & Assessing...' : '2. Correlate & Assess'}
                </button>
            </div>
            
            {results.correlate && (
                <div style={{ marginTop: '1.5rem', background: 'var(--surface-color-light)', padding: '1.5rem', borderRadius: '0.5rem', borderLeft: '4px solid #ec4899' }}>
                    <h3 style={{ marginBottom: '1rem', color: '#ec4899' }}>Assessment Result</h3>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{results.correlate.assessment?.level}</div>
                    <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>{results.correlate.assessment?.summary}</div>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
