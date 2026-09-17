
import { useState } from 'react';
import AuthenticatedImage from './AuthenticatedImage';

export default function AnalysisJobCard({ job, analysisType, result, onRun, disabled }: any) {
    const [showArtifact, setShowArtifact] = useState(true);
    const isRunning = job?.status === 'QUEUED' || job?.status === 'RUNNING';
    const isCompleted = job?.status === 'COMPLETED';
    const isFailed = job?.status === 'FAILED';

    let durationText = '';
    if (job?.started_at && job?.completed_at) {
        const start = new Date(job.started_at).getTime();
        const end = new Date(job.completed_at).getTime();
        durationText = `${((end - start) / 1000).toFixed(2)}s`;
    } else if (job?.created_at && job?.completed_at) {
        const start = new Date(job.created_at).getTime();
        const end = new Date(job.completed_at).getTime();
        durationText = `${((end - start) / 1000).toFixed(2)}s`;
    }

    // Extract artifact paths if present
    const artifacts = result?.structured_findings?.artifacts || {};
    const primaryArtifact = artifacts.ela_map || artifacts.residual_map || artifacts.matches || Object.values(artifacts)[0];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-color-light)', padding: '1.25rem', borderRadius: '0.5rem', borderLeft: `4px solid ${isFailed ? '#ef4444' : isCompleted ? '#10b981' : isRunning ? '#3b82f6' : 'var(--border-color)'}`, transition: 'all 0.2s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontWeight: 600 }}>{analysisType}</span>
                    <span style={{ fontSize: '0.8rem', color: isFailed ? '#ef4444' : isCompleted ? '#10b981' : isRunning ? '#3b82f6' : 'var(--text-muted)', fontWeight: 'bold' }}>
                        {job ? job.status : 'NOT RUN'}
                    </span>
                    {durationText && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({durationText})</span>}
                </div>
                <button 
                    className="btn btn-primary" 
                    onClick={onRun} 
                    disabled={disabled || isRunning || isCompleted} 
                    style={{ background: isRunning ? 'var(--text-muted)' : isCompleted ? 'transparent' : 'var(--primary-color)', color: isCompleted ? 'var(--text-muted)' : 'white', border: isCompleted ? '1px solid var(--border-color)' : 'none', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                >
                    {isRunning ? 'Running...' : isCompleted ? 'Completed' : 'Queue Analysis'}
                </button>
            </div>
            
            {isFailed && (
                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>
                    <strong>Job {job?.job_identifier || ''} Failed:</strong> {job?.safe_error_message || 'Analysis could not be completed.'}
                </div>
            )}
            
            {isRunning && (
                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#3b82f6' }}>
                    Job {job?.job_identifier} is currently {job?.status}...
                </div>
            )}

            {isCompleted && result && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                    {result.summary && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            {result.summary}
                        </div>
                    )}

                    {primaryArtifact ? (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>Visual Forensic Artifact:</span>
                                <button 
                                    onClick={() => setShowArtifact(!showArtifact)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    {showArtifact ? 'Hide Artifact' : 'Show Artifact'}
                                </button>
                            </div>
                            {showArtifact && (
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden', maxHeight: '300px', display: 'flex', justifyContent: 'center', background: '#0a0a0c' }}>
                                    <AuthenticatedImage 
                                        src={typeof primaryArtifact === 'string' ? primaryArtifact : ''} 
                                        alt={`${analysisType} Artifact`} 
                                        style={{ maxHeight: '300px', objectFit: 'contain' }}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No visualization artifact was generated for this analysis.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
