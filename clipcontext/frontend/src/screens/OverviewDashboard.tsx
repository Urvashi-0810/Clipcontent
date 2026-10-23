import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  Video,
  Send,
  ShieldCheck,
  Zap,
  ArrowRight,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Project, SourceAsset, ClipCandidate, PublishingJob } from '../types';
import { api } from '../services/api';

interface OverviewDashboardProps {
  currentProject: Project | null;
  onNavigate: (view: string, candidateId?: string) => void;
  onOpenUpload: () => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  currentProject,
  onNavigate,
  onOpenUpload,
}) => {
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [sources, setSources] = useState<SourceAsset[]>([]);
  const [publishingJobs, setPublishingJobs] = useState<PublishingJob[]>([]);
  const [analyticsOverview, setAnalyticsOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [cands, srcs, jobs, stats] = await Promise.all([
          api.getCandidates({ projectId: currentProject?.id }),
          api.getSourceAssets(currentProject?.id),
          api.getPublishingJobs(),
          api.getAnalyticsOverview(),
        ]);
        setCandidates(cands);
        setSources(srcs);
        setPublishingJobs(jobs);
        setAnalyticsOverview(stats);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [currentProject?.id]);

  const awaitingReviewCount = candidates.filter(
    (c) => c.lifecycle_status === 'draft' || c.lifecycle_status === 'ready_for_review'
  ).length;

  const publishedCanaryCount = candidates.filter(
    (c) => c.lifecycle_status === 'published_test' || c.lifecycle_status === 'awaiting_metrics'
  ).length;

  const viralLeader = analyticsOverview?.viral_leader;

  return (
    <div className="view-container">
      {/* Welcome Banner */}
      <div className="hero-banner mb-6">
        <div className="hero-banner-content">
          <div className="flex gap-2 mb-2 items-center">
            <span className="badge badge-blue">AutoClip AI Architecture</span>
            <span className="caption text-muted">
              Source Requirements: Presentation Pages 11–18
            </span>
          </div>
          <h1 className="heading-1 mb-2">
            Multi-Variant Clipping & Canary Growth Engine
          </h1>
          <p className="text-secondary body">
            Transform long-form videos into candidate cuts across 10 psychological hook strategies.
            Safely test variants on secondary accounts without main-channel algorithmic risk.
          </p>
        </div>

        <div className="hero-banner-actions">
          <button
            onClick={onOpenUpload}
            className="btn btn-primary"
          >
            <Video size={16} />
            <span>Import Source Video</span>
          </button>
          <button
            onClick={() => onNavigate('candidates')}
            className="btn"
          >
            <Sparkles size={16} />
            <span>Review Candidates</span>
          </button>
        </div>
      </div>

      {/* 4 Core Workflow KPIs */}
      <div className="grid grid-4 mb-6">
        <div className="stat-card">
          <div className="stat-header">
            <span className="caption text-muted">STAGE 1: SOURCE MEDIA</span>
            <Video size={18} color="var(--blue)" />
          </div>
          <div className="stat-value">{sources.length}</div>
          <div className="stat-caption">
            {sources.length > 0 ? 'Local pre-filter scanned' : 'No source files imported'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="caption text-muted">STAGE 2 & 3: CANDIDATES</span>
            <Sparkles size={18} color="var(--accent-purple, #a855f7)" />
          </div>
          <div className="stat-value">{candidates.length}</div>
          <div className="stat-caption">
            {awaitingReviewCount} cuts awaiting review
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="caption text-muted">STAGE 4: CANARY TESTS</span>
            <Send size={18} color="var(--accent-amber, #f59e0b)" />
          </div>
          <div className="stat-value">
            {analyticsOverview?.total_published_tests || 0}
          </div>
          <div className="stat-caption">
            {analyticsOverview?.total_test_views?.toLocaleString() || '0'} aggregate test views
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="caption text-muted">AVG COMPLETION RATE</span>
            <TrendingUp size={18} color="var(--accent-emerald, #10b981)" />
          </div>
          <div className="stat-value" style={{ color: '#10b981' }}>
            {analyticsOverview?.average_completion_rate || 0}%
          </div>
          <div className="stat-caption">
            Short-form benchmark: &gt;65%
          </div>
        </div>
      </div>

      {/* Viral Breakout Banner */}
      {viralLeader && (
        <div className="viral-banner mb-6">
          <div className="viral-banner-info">
            <div className="icon-circle icon-circle-green">
              <Zap size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="badge badge-green">VIRAL HIT DETECTED</span>
                <span className="caption text-muted">
                  Velocity Score: {viralLeader.velocity_score} / 10
                </span>
              </div>
              <div className="heading-3 mt-1">
                {viralLeader.title}
              </div>
              <div className="caption text-secondary">
                {viralLeader.views.toLocaleString()} test views • {viralLeader.completion_rate}% completion rate on Canary Account
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('promotion', viralLeader.id)}
            className="btn btn-primary"
            style={{ background: '#10b981', borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <ShieldCheck size={16} />
            <span>Escalate to Main Channel</span>
          </button>
        </div>
      )}

      {/* Main Grid: Candidates awaiting review & Canary Upload status */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '2fr 1fr' }}>
        {/* Candidates Pool */}
        <div className="card p-5">
          <div className="flex-between mb-4">
            <div>
              <h2 className="heading-2">Leading Candidate Cuts</h2>
              <p className="caption text-secondary">
                Generated from 10 psychological angles & ranked by discriminator engine
              </p>
            </div>
            <button
              onClick={() => onNavigate('candidates')}
              className="btn btn-sm"
            >
              <span>View All ({candidates.length})</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="flex-col gap-2">
            {candidates.slice(0, 4).map((cand) => (
              <div key={cand.id} className="list-item">
                <div className="list-item-content mr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge badge-purple caption">
                      {cand.hook_strategy.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="caption text-muted">
                      Duration: {Math.round(cand.end_time - cand.start_time)}s
                    </span>
                    <span className="badge badge-blue caption">
                      Score: {cand.ranking_score}
                    </span>
                  </div>
                  <div className="list-item-title">{cand.title}</div>
                  <div className="list-item-subtitle mt-1">
                    Timecode: {cand.grounding_source_timecode}
                  </div>
                </div>

                <div className="list-item-actions">
                  <button
                    onClick={() => onNavigate('editor', cand.id)}
                    className="btn btn-sm"
                  >
                    Open Editor
                  </button>
                  <button
                    onClick={() => onNavigate('test_studio', cand.id)}
                    className="btn btn-primary btn-sm"
                  >
                    Test Preview
                  </button>
                </div>
              </div>
            ))}

            {candidates.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-text">
                  No candidates yet. Import a source video to generate or create candidate clips.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side: 4-Stage Distribution Pipeline Summary */}
        <div className="card p-5">
          <h2 className="heading-2 mb-1">
            AutoClip Canary Pipeline
          </h2>
          <p className="caption text-secondary mb-4">
            Four-Stage Distribution Workflow (Slide 16)
          </p>

          <div className="flex-col gap-4">
            <div className="pipeline-step flex items-start gap-3">
              <div className="pipeline-num icon-circle icon-circle-blue">
                1
              </div>
              <div>
                <div className="pipeline-title">Multi-Cut Extraction</div>
                <div className="pipeline-desc">
                  Extract multiple duration and hook variants from local source video.
                </div>
              </div>
            </div>

            <div className="pipeline-step flex items-start gap-3">
              <div className="pipeline-num icon-circle icon-circle-amber">
                2
              </div>
              <div>
                <div className="pipeline-title">Canary Test Posting</div>
                <div className="pipeline-desc">
                  Distribute candidate cuts across secondary accounts without risking main reach.
                </div>
              </div>
            </div>

            <div className="pipeline-step flex items-start gap-3">
              <div className="pipeline-num icon-circle icon-circle-purple">
                3
              </div>
              <div>
                <div className="pipeline-title">Velocity Reach Tracking</div>
                <div className="pipeline-desc">
                  Monitor completion rates, watch time, and engagement velocity index.
                </div>
              </div>
            </div>

            <div className="pipeline-step flex items-start gap-3">
              <div className="pipeline-num icon-circle icon-circle-green">
                4
              </div>
              <div>
                <div className="pipeline-title">Main-Channel Escalation</div>
                <div className="pipeline-desc">
                  Creator reviews proven viral metrics and confirms promotion with explicit safeguards.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
