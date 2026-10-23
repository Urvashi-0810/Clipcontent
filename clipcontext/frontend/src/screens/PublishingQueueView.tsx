import React, { useEffect, useState } from 'react';
import {
  ListOrdered,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Send,
  ShieldCheck
} from 'lucide-react';
import { PublishingJob } from '../types';
import { api } from '../services/api';

export const PublishingQueueView: React.FC = () => {
  const [jobs, setJobs] = useState<PublishingJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await api.getPublishingJobs();
      setJobs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="badge badge-green">PUBLISHED</span>;
      case 'uploading':
        return <span className="badge badge-blue">UPLOADING...</span>;
      case 'queued':
        return <span className="badge badge-amber">QUEUED</span>;
      case 'failed':
        return <span className="badge badge-red">FAILED</span>;
      default:
        return <span className="badge badge-neutral">{status.toUpperCase()}</span>;
    }
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="heading-2">Distribution & Publishing Queue</h1>
          <p className="text-secondary">
            Stage 4 Pipeline: Real-time tracking of canary test dispatches and main-channel escalation jobs.
          </p>
        </div>

        <div className="page-header-actions">
          <button onClick={loadJobs} className="btn btn-ghost">
            <RefreshCw size={14} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="card">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Candidate Clip</th>
              <th>Destination</th>
              <th>Target Account</th>
              <th>Status</th>
              <th>Mode</th>
              <th className="text-right">Published Link</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="mono text-muted">
                  {job.id.slice(0, 8)}...
                </td>
                <td className="truncate" style={{ maxWidth: '280px', fontWeight: 600 }}>
                  {job.candidate_title || 'Clip Cut'}
                </td>
                <td>
                  <span
                    className={`badge ${
                      job.target_destination === 'canary_test' ? 'badge-amber' : 'badge-green'
                    }`}
                  >
                    {job.target_destination === 'canary_test' ? 'CANARY TEST' : 'MAIN CHANNEL'}
                  </span>
                </td>
                <td className="text-secondary">
                  {job.account_display_name} ({job.platform?.replace('_', ' ')})
                </td>
                <td>{getStatusBadge(job.status)}</td>
                <td>
                  <span className="badge badge-neutral">
                    {job.is_simulation ? 'SIMULATION' : 'LIVE'}
                  </span>
                </td>
                <td className="text-right">
                  {job.published_video_url ? (
                    <a
                      href={job.published_video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-ghost inline-flex"
                    >
                      <span>View</span>
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-muted caption">In progress</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {jobs.length === 0 && !loading && (
          <div className="empty-state p-6">
            <div className="empty-state-text">No publishing jobs in queue yet.</div>
          </div>
        )}
      </div>
    </div>
  );
};
