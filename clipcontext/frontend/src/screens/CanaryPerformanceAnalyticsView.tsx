import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Zap,
  Eye,
  Heart,
  MessageSquare,
  Share2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowUpRight
} from 'lucide-react';
import { ClipCandidate, Project } from '../types';
import { api } from '../services/api';

interface CanaryPerformanceAnalyticsViewProps {
  currentProject: Project | null;
  onNavigatePromotion: (candidateId: string) => void;
}

export const CanaryPerformanceAnalyticsView: React.FC<CanaryPerformanceAnalyticsViewProps> = ({
  currentProject,
  onNavigatePromotion,
}) => {
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [comparedData, setComparedData] = useState<any[]>([]);
  const [evalWindow, setEvalWindow] = useState<'12h' | '24h' | '48h'>('24h');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const cands = await api.getCandidates({ projectId: currentProject?.id });
        setCandidates(cands);

        const publishedIds = cands
          .filter((c) => c.lifecycle_status === 'published_test' || c.lifecycle_status === 'selected_for_main' || c.lifecycle_status === 'awaiting_metrics')
          .map((c) => c.id);

        if (publishedIds.length > 0) {
          const comp = await api.compareCandidates(publishedIds);
          setComparedData(comp);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentProject?.id]);

  // Find top velocity candidate (viral breakout candidate)
  const viralLeader = comparedData.length > 0
    ? [...comparedData].sort((a, b) => b.velocity_score - a.velocity_score)[0]
    : null;

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="heading-2">Canary Testing & Velocity Analytics</h1>
          <p className="text-secondary">
            Stage 4 Analytics: Monitor engagement velocity, average completion rates, and identify mathematically proven viral hits.
          </p>
        </div>

        {/* Evaluation Window Switcher */}
        <div className="page-header-actions">
          <div className="tabs">
            {(['12h', '24h', '48h'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setEvalWindow(w)}
                className={`tab ${evalWindow === w ? 'active' : ''}`}
              >
                {w} Window
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Breakout Viral Leader Callout */}
      {viralLeader && (
        <div className="viral-banner mb-6">
          <div className="viral-banner-info flex items-center gap-4">
            <div className="icon-circle icon-circle-green">
              <Zap size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="badge badge-green">CANARY TEST WINNER DETECTED</span>
                <span className="caption text-muted">
                  Velocity Index: <strong>{viralLeader.velocity_score} / 10</strong>
                </span>
              </div>
              <div className="heading-3 mt-1">
                {viralLeader.title} ({viralLeader.variant_name})
              </div>
              <div className="text-secondary text-sm mt-1">
                {viralLeader.views.toLocaleString()} test views • {viralLeader.completion_rate}% completion rate • Zero algorithm risk to main channel!
              </div>
            </div>
          </div>

          <div className="viral-banner-actions">
            <button
              onClick={() => onNavigatePromotion(viralLeader.id)}
              className="btn btn-success"
            >
              <ShieldCheck size={16} />
              <span>Escalate to Main Channel</span>
            </button>
          </div>
        </div>
      )}

      {/* Comparison Metrics Table */}
      <div className="card">
        <h2 className="heading-3 mb-4">
          Canary Performance Comparison Matrix
        </h2>

        <table className="table w-full">
          <thead>
            <tr>
              <th>Candidate Cut</th>
              <th>Hook Strategy</th>
              <th>Views</th>
              <th>Likes</th>
              <th>Shares</th>
              <th>Completion Rate</th>
              <th>Velocity Score</th>
              <th className="text-right">Promotion Status</th>
            </tr>
          </thead>
          <tbody>
            {comparedData.map((cand) => (
              <tr key={cand.id}>
                <td className="truncate" style={{ maxWidth: '240px', fontWeight: 600 }}>
                  {cand.title}
                  <div className="caption text-muted">{cand.variant_name}</div>
                </td>
                <td>
                  <span className="badge badge-purple caption">
                    {cand.hook_strategy.replace('_', ' ').toUpperCase()}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{cand.views.toLocaleString()}</td>
                <td>{cand.likes.toLocaleString()}</td>
                <td>{cand.shares.toLocaleString()}</td>
                <td>
                  <span
                    style={{
                      fontWeight: 700,
                      color: cand.completion_rate >= 65 ? 'var(--green)' : 'var(--amber)',
                    }}
                  >
                    {cand.completion_rate}%
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 700 }}>{cand.velocity_score}</span>
                    {cand.velocity_score >= 8.5 && (
                      <span className="badge badge-green text-xs">
                        VIRAL
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right">
                  <button
                    onClick={() => onNavigatePromotion(cand.id)}
                    className="btn btn-sm btn-primary"
                  >
                    Review Promotion
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {comparedData.length === 0 && !loading && (
          <div className="empty-state p-6">
            <div className="empty-state-text">No test candidates currently publishing in Canary sandbox.</div>
          </div>
        )}
      </div>
    </div>
  );
};
