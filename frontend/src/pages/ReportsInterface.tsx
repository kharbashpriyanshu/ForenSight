import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function ReportsInterface() {
  const { caseId } = useParams<{ caseId: string }>();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [caseId]);

  const fetchReports = () => {
    fetch(`http://localhost:8000/api/cases/${caseId}/reports`)
      .then(res => res.json())
      .then(data => {
        setReports(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const handleGenerate = () => {
    setGenerating(true);
    fetch(`http://localhost:8000/api/cases/${caseId}/reports`, { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        setGenerating(false);
        fetchReports();
      })
      .catch(err => {
        console.error(err);
        setGenerating(false);
      });
  };

  if (loading) return <div>Loading reports...</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Investigation Reports</h2>
        <button 
          className="primary-button" 
          onClick={handleGenerate} 
          disabled={generating}
        >
          {generating ? 'Generating...' : 'Generate Investigation Report'}
        </button>
      </div>

      {reports.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No reports generated yet.</p>
      ) : (
        <table className="evidence-table">
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Generated At</th>
              <th>Rule Version</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report, i) => (
              <tr key={i}>
                <td>{report.report_identifier}</td>
                <td>{new Date(report.generated_at).toLocaleString()}</td>
                <td>{report.rule_version}</td>
                <td><span className="badge">{report.status}</span></td>
                <td>
                  <a 
                    href={`http://localhost:8000/api/reports/${report.report_identifier}/download`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="secondary-button"
                    style={{ textDecoration: 'none', display: 'inline-block' }}
                  >
                    Download JSON
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
