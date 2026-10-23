import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  FileText
} from 'lucide-react';
import { ProcessingJob, AuditEvent } from '../types';
import { api } from '../services/api';

export const ProcessingJobsView: React.FC = () => {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jList, aList] = await Promise.all([
        api.getProcessingJobs(),
        api.getActivityHistory(),
      ]);
      setJobs(jList);
      setAuditEvents(aList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5">
        <div className="page-header-text">
          <h1 className="heading-2">Processing Jobs & Audit Activity</h1>
          <p className="text-secondary">
            Telemetry of asynchronous media tasks, Stage 1 frame scanning, and tamper-resistant audit logs.
          </p>
        </div>

        <div className="page-header-actions">
          <button onClick={loadData} className="btn btn-ghost">
            <RefreshCw size={14} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      <div className="grid grid-2 gap-5" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        {/* Background Processing Jobs */}
        <div className="card p-5">
          <h3 className="heading-3 mb-4">
            Background Media & Processing Jobs
          </h3>

          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="list-item"
              >
                <div className="flex-between mb-1">
                  <span className="font-semibold text-sm">
                    {job.job_type.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="badge badge-green">
                    {job.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-muted caption">
                  Step: {job.step_description} • Progress: {job.progress}%
                </div>
              </div>
            ))}

            {jobs.length === 0 && (
              <div className="alert alert-success">
                ✓ All background media pipelines idle. Local-first analysis active and responsive.
              </div>
            )}
          </div>
        </div>

        {/* Audit Trail Activity Log */}
        <div className="card p-5">
          <h3 className="heading-3 mb-4">
            System Audit Event Log
          </h3>

          <div className="table-responsive" style={{ maxHeight: '420px' }}>
            <table className="table w-full text-xs">
              <tbody>
                {auditEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td>
                      <div className="flex-between mb-1">
                        <span className="badge badge-blue px-2 py-0 text-xs">
                          {evt.event_type}
                        </span>
                        <span className="text-muted caption">
                          {new Date(evt.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-primary mb-1">
                        {evt.description}
                      </div>
                      <div className="text-muted caption">
                        Actor: {evt.actor}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
