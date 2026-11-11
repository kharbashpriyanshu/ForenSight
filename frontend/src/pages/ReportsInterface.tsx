import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { fetchApi } from '../api';

interface ReportItem {
  id: number;
  report_identifier: string;
  case_id: string;
  generated_at: string;
  rule_version: string;
  report_type: string;
  status: string;
  artifact_path?: string;
}

export default function ReportsInterface() {
  const { caseId } = useParams<{ caseId: string }>();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [formatOption, setFormatOption] = useState<'pdf' | 'json'>('pdf');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    fetchReports();
  }, [caseId]);

  const fetchReports = () => {
    fetchApi(`/cases/${caseId}/reports`)
      .then(res => res.json())
      .then(data => {
        setReports(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const handleGenerate = () => {
    setGenerating(true);
    fetchApi(`/cases/${caseId}/reports?format=${formatOption}`, { method: 'POST' })
      .then(async res => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Failed to generate report');
        }
        return res.json();
      })
      .then(() => {
        setGenerating(false);
        fetchReports();
      })
      .catch(err => {
        alert(err.message);
        setGenerating(false);
      });
  };

  const handleDownload = async (report: ReportItem, format: 'pdf' | 'json') => {
    setDownloadingId(`${report.report_identifier}-${format}`);
    try {
      const res = await fetchApi(`/reports/${report.report_identifier}/download?format=${format}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Download failed with HTTP ${res.status}`);
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.report_identifier}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download Error: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCaseExport = async () => {
    setExportingBundle(true);
    setExportError('');
    try {
      const res = await fetchApi(`/cases/${caseId}/export`, { cache: 'no-store' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Export failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${caseId}.forensight`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export this case.');
    } finally {
      setExportingBundle(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading reports...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Generator Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Forensic Investigation Reports</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Review-ready PDF reports and reproducible JSON exports for analyst and independent review
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={formatOption}
                onChange={e => setFormatOption(e.target.value as 'pdf' | 'json')}
                style={{ padding: '0.55rem 0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
              >
                <option value="pdf">Formal Case Report (PDF)</option>
                <option value="json">Case Findings & Summary (JSON)</option>
              </select>

              <button 
                className="primary-button" 
                onClick={handleGenerate} 
                disabled={generating}
              >
                {generating ? 'Compiling Report...' : 'Compile Case Report'}
              </button>
              <button className="secondary-button" onClick={() => void handleCaseExport()} disabled={exportingBundle}>
                {exportingBundle ? 'Packaging archive…' : 'Export Case Archive (.forensight)'}
              </button>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              Case bundles package raw evidence binaries, manifests, and Ed25519 signatures (when configured on server)
            </div>
          </div>
        </div>

        {exportError && (
          <div role="alert" style={{ marginTop: '0.75rem', padding: '0.55rem 0.85rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', color: '#ef4444', fontSize: '0.8rem' }}>
            <strong>Export Notice:</strong> {exportError.toLowerCase().includes('signing') ? 'Case bundle signing is not configured on this server (server requires CASE_EXPORT_SIGNING_PRIVATE_KEY configuration before exporting signed bundles).' : exportError}
          </div>
        )}

        <div style={{ marginTop: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '4px solid var(--primary-color)', padding: '0.75rem 1rem', borderRadius: '4px', fontSize: '0.85rem' }}>
          <strong>Publication Standard:</strong> Generated reports include Title Header, Case Registry, Ingested Evidence Hashes, Multi-Modality Observations (ELA, Noise, JPEG-DCT, Copy-Move, Metadata), Correlated Forensic Assessment, Technical Chain of Custody, and Explicit Scientific Limitations.
        </div>
      </div>

      {/* Reports Table Card */}
      <div className="card">
        <h3 className="card-title">Generated Case Reports ({reports.length})</h3>

        {reports.length === 0 ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '8px', 
              background: 'rgba(59, 130, 246, 0.08)', 
              color: 'var(--primary-color)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 0.75rem' 
            }}>
              <FileText size={20} />
            </div>
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              No Case Reports Compiled Yet
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.825rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
              Formal case reports synthesize evidence hashes, multi-modality observations (ELA, noise residuals, DCT block grids), and immutable custody logs into an archival document.
            </p>
            <button 
              type="button"
              className="primary-button" 
              onClick={handleGenerate} 
              disabled={generating}
              style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
            >
              {generating ? 'Compiling Report...' : `Compile ${formatOption.toUpperCase()} Report`}
            </button>
          </div>
        ) : (
          <table className="evidence-table">
            <thead>
              <tr>
                <th>Report Identifier</th>
                <th>Generated Timestamp</th>
                <th>Rule Version</th>
                <th>Status</th>
                <th>Artifact Downloads</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>
                    <strong style={{ color: 'var(--text-color)' }}>{report.report_identifier}</strong>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{new Date(report.generated_at).toLocaleString()}</td>
                  <td style={{ fontSize: '0.85rem' }}>{report.rule_version}</td>
                  <td>
                    <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                      {report.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button 
                        className="secondary-button"
                        onClick={() => handleDownload(report, 'pdf')}
                        disabled={downloadingId === `${report.report_identifier}-pdf`}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                      >
                        {downloadingId === `${report.report_identifier}-pdf` ? 'Downloading...' : 'PDF Report'}
                      </button>

                      <button 
                        className="secondary-button"
                        onClick={() => handleDownload(report, 'json')}
                        disabled={downloadingId === `${report.report_identifier}-json`}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                      >
                        {downloadingId === `${report.report_identifier}-json` ? 'Downloading...' : 'JSON Data'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
