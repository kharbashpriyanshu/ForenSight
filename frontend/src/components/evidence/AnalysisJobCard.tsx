import { useState } from 'react';
import AuthenticatedImage from './AuthenticatedImage';

interface AnalysisJobCardProps {
    job: any;
    analysisType: string;
    result: any;
    onRun: () => void;
    disabled?: boolean;
}

// Explicit scientific limitations per modality according to NIST / SWGDE standards
const MODALITY_LIMITATIONS: Record<string, string> = {
    'Metadata': 'EXIF/XMP metadata can be modified, stripped, or forged without altering pixel data. Lack of EXIF does not inherently imply manipulation.',
    'Error Level Analysis': 'Single-pass ELA is sensitive to recompression quality factors and high-contrast edges. Multiple saves at varying compression rates produce baseline variances.',
    'Noise Residual': 'High ISO, denoising algorithms, and post-capture filtering can alter PRNU/noise distribution without manual manipulation.',
    'JPEG / DCT': 'Double JPEG compression artifacts occur legitimately during export, rotation, or social media uploads and must be interpreted with context.',
    'Copy-Move': 'Repetitive textures, natural grass/foliage, and architectural patterns can produce pseudo-matches. Requires geometric consistency verification.'
};

export default function AnalysisJobCard({ job, analysisType, result, onRun, disabled }: AnalysisJobCardProps) {
    const [showArtifact, setShowArtifact] = useState(true);
    const [showRaw, setShowRaw] = useState(false);

    const rawStatus = String(job?.status || '').toUpperCase();
    const isRunning = rawStatus === 'QUEUED' || rawStatus === 'INITIALIZING' || rawStatus === 'RUNNING' || rawStatus === 'PROCESSING' || rawStatus === 'RETRYING';
    const isCompleted = rawStatus === 'COMPLETED';
    const isFailed = rawStatus === 'FAILED';
    const isCancelled = rawStatus === 'CANCELLED';

    const hasNumericProgress = (rawStatus === 'RUNNING' || rawStatus === 'PROCESSING')
        && typeof job?.progress_percent === 'number'
        && Number.isFinite(job.progress_percent)
        && job.progress_percent > 0;

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

    // Extract artifact paths
    const artifacts = result?.structured_findings?.artifacts || {};
    const primaryArtifact = artifacts.ela_map || artifacts.residual_map || artifacts.matches || Object.values(artifacts)[0];
    
    // Extract raw measurements if available
    const rawData = result?.structured_findings || result?.raw_measurements || null;
    const limitationNotice = MODALITY_LIMITATIONS[analysisType] || 'Classical forensic engine results require context and cannot solely prove intent.';

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            background: 'var(--surface-color-light)', 
            padding: '1.25rem', 
            borderRadius: '0.5rem', 
            borderLeft: `4px solid ${isFailed ? '#ef4444' : isCompleted ? '#10b981' : isRunning ? '#3b82f6' : 'var(--border-color)'}`, 
            transition: 'all 0.2s ease',
            gap: '0.75rem'
        }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-color)' }}>{analysisType}</span>
                    <span style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '3px',
                        background: isFailed ? 'var(--status-anomalous-bg)' : isCompleted ? 'var(--status-nominal-bg)' : isRunning ? 'var(--status-info-bg)' : isCancelled ? 'var(--status-warning-bg)' : 'rgba(156, 163, 175, 0.15)',
                        color: isFailed ? 'var(--status-anomalous)' : isCompleted ? 'var(--status-nominal)' : isRunning ? 'var(--status-info)' : isCancelled ? 'var(--status-warning)' : 'var(--text-muted)', 
                        fontWeight: 700 
                    }}>
                        {rawStatus || 'NOT RUN'}
                    </span>
                    {durationText && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({durationText})</span>}
                </div>
                <button 
                    className="btn btn-primary" 
                    onClick={onRun} 
                    disabled={disabled || isRunning || isCompleted} 
                    style={{ 
                        background: isRunning ? 'var(--text-muted)' : isCompleted ? 'transparent' : 'var(--primary-color)', 
                        color: isCompleted ? 'var(--text-muted)' : 'white', 
                        border: isCompleted ? '1px solid var(--border-color)' : 'none', 
                        padding: '0.35rem 0.75rem', 
                        fontSize: '0.85rem' 
                    }}
                >
                    {isRunning ? (rawStatus === 'QUEUED' ? 'Queued…' : rawStatus === 'RETRYING' ? 'Retrying…' : 'Processing…') : isCompleted ? 'Completed' : isFailed ? 'Retry Analysis' : isCancelled ? 'Re-queue Analysis' : 'Queue Analysis'}
                </button>
            </div>
            
            {/* Failed notification */}
            {isFailed && (
                <div role="alert" style={{ fontSize: '0.85rem', color: 'var(--status-anomalous)', background: 'var(--status-anomalous-bg)', border: '1px solid var(--status-anomalous-border)', padding: '0.75rem', borderRadius: '6px' }}>
                    <strong>Job {job?.job_identifier || ''} Failed:</strong> {job?.safe_error_message || 'Analysis could not be completed.'}
                </div>
            )}

            {/* Cancelled notification */}
            {isCancelled && (
                <div role="status" style={{ fontSize: '0.85rem', color: 'var(--status-warning)', background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', padding: '0.75rem', borderRadius: '6px' }}>
                    <strong>Job {job?.job_identifier || ''} Cancelled:</strong> {job?.progress_message || 'Analysis run was cancelled before completion.'}
                </div>
            )}
            
            {/* Running / Queued / Initializing / Retrying status */}
            {isRunning && (
                <div role="status" aria-live="polite" aria-busy="true" style={{ fontSize: '0.85rem', color: 'var(--status-info)' }}>
                    <div style={{ fontWeight: 600 }}>
                        {job?.progress_message || (
                            rawStatus === 'QUEUED'
                                ? 'Queued — waiting for analysis worker…'
                                : rawStatus === 'INITIALIZING'
                                ? 'Initializing forensic engine…'
                                : rawStatus === 'RETRYING'
                                ? 'Temporary error — retry scheduled…'
                                : 'Processing forensic analysis…'
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.45rem' }}>
                        <div
                            className="fs-progress-track"
                            role="progressbar"
                            aria-label={`${analysisType} progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={hasNumericProgress ? Math.round(job.progress_percent) : undefined}
                        >
                            {hasNumericProgress ? (
                                <div
                                    className="fs-progress-fill-determinate"
                                    style={{ width: `${Math.min(100, Math.round(job.progress_percent))}%` }}
                                />
                            ) : (
                                <div className="fs-progress-fill-indeterminate" />
                            )}
                        </div>
                        {hasNumericProgress && (
                            <strong style={{ fontVariantNumeric: 'tabular-nums', minWidth: '2.5rem', textAlign: 'right' }}>
                                {Math.round(job.progress_percent)}%
                            </strong>
                        )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                        Job {job?.job_identifier} · status: {rawStatus} · attempt {job?.attempt_count || 0}
                    </div>
                </div>
            )}

            {/* Completed results display */}
            {isCompleted && result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    
                    {/* Visual Artifact */}
                    {primaryArtifact && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>Visual Forensic Artifact:</span>
                                <button 
                                    onClick={() => setShowArtifact(!showArtifact)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    {showArtifact ? 'Hide Artifact' : 'Show Artifact'}
                                </button>
                            </div>
                            {showArtifact && (
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden', maxHeight: '260px', display: 'flex', justifyContent: 'center', background: '#0a0a0c' }}>
                                    <AuthenticatedImage 
                                        src={typeof primaryArtifact === 'string' ? primaryArtifact : ''} 
                                        alt={`${analysisType} Artifact`} 
                                        style={{ maxHeight: '260px', objectFit: 'contain' }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Scientific Interpretation Block */}
                    <div style={{ background: 'var(--surface-color)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--primary-color)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Engine Interpretation & Observation
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            {result.summary || 'Observation recorded by classical forensic algorithm.'}
                        </div>
                    </div>

                    {/* Scientific Limitations Notice */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '0.6rem 0.75rem', borderRadius: '4px', borderLeft: '3px solid #f59e0b' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                            Scientific Limitation
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {limitationNotice}
                        </div>
                    </div>

                    {/* Raw Measurements Toggle */}
                    <div>
                        <button 
                            onClick={() => setShowRaw(!showRaw)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >
                            {showRaw ? 'Hide Raw Measurements' : 'Show Raw Measurements & Findings Data'}
                        </button>
                        {showRaw && rawData && (
                            <pre style={{ 
                                background: '#0d1117', 
                                color: '#58a6ff', 
                                padding: '0.75rem', 
                                borderRadius: '4px', 
                                fontSize: '0.75rem', 
                                overflowX: 'auto', 
                                maxHeight: '200px',
                                marginTop: '0.5rem',
                                border: '1px solid var(--border-color)' 
                            }}>
                                {JSON.stringify(rawData, null, 2)}
                            </pre>
                        )}
                    </div>

                    {/* Reproducibility Metadata Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem' }}>
                        <span>Engine version: <strong>{job?.engine_version || 'legacy'}</strong></span>
                        <span>Job ID: {job?.job_identifier || 'N/A'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
