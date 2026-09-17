import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading reports...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Generator Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Forensic Investigation Reports</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Court-admissible PDF forensic reports and raw reproducible JSON exports
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select
              value={formatOption}
              onChange={e => setFormatOption(e.target.value as 'pdf' | 'json')}
              style={{ padding: '0.55rem 0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', fontSize: '0.85rem' }}
            >
              <option value="pdf">Formal PDF Report (ReportLab)</option>
              <option value="json">Raw Data Export (JSON)</option>
            </select>

            <button 
              className="primary-button" 
              onClick={handleGenerate} 
              disabled={generating}
            >
              {generating ? 'Compiling Report...' : 'Generate New Report'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '4px solid var(--primary-color)', padding: '0.75rem 1rem', borderRadius: '4px', fontSize: '0.85rem' }}>
          <strong>Publication Standard:</strong> Generated reports include Title Header, Case Registry, Ingested Evidence Hashes, Multi-Modality Observations (ELA, Noise, JPEG-DCT, Copy-Move, Metadata), Fusion 7B-v1 Assessment, Technical Chain of Custody, and Explicit Scientific Limitations.
        </div>
      </div>

      {/* Reports Table Card */}
      <div className="card">
        <h3 className="card-title">Generated Case Reports ({reports.length})</h3>

        {reports.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No investigation reports generated yet. Click "Generate New Report" to compile a formal report.
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
