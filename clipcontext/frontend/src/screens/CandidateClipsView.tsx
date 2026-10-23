import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  LayoutGrid,
  List,
  Filter,
  Copy,
  Scissors,
  Send,
  Trash2,
  Clock,
  CheckCircle,
  Eye,
  Star,
  Download,
  EyeOff
} from 'lucide-react';
import { ClipCandidate, Project } from '../types';
import { api } from '../services/api';
import { ClipDetailModal } from '../components/ClipDetailModal';

interface CandidateClipsViewProps {
  currentProject: Project | null;
  onOpenEditor: (candidateId: string) => void;
  onOpenTestStudio: (candidateId: string) => void;
  onOpenPromotion: (candidateId: string) => void;
}

export const CandidateClipsView: React.FC<CandidateClipsViewProps> = ({
  currentProject,
  onOpenEditor,
  onOpenTestStudio,
  onOpenPromotion,
}) => {
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [detailClipId, setDetailClipId] = useState<string | null>(null);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const data = await api.getCandidates({
        projectId: currentProject?.id,
        hookStrategy: selectedStrategy !== 'all' ? selectedStrategy : undefined,
        lifecycleStatus: selectedStatus !== 'all' ? selectedStatus : undefined,
      });
      setCandidates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, [currentProject?.id, selectedStrategy, selectedStatus]);

  // Refresh while the worker is still rendering clips
  const anyProcessing = candidates.some((c) => c.backend_status && c.backend_status !== 'done' && c.backend_status !== 'error' && c.backend_status !== 'cancelled');
  useEffect(() => {
    if (!anyProcessing) return;
    const timer = setInterval(loadCandidates, 8000);
    return () => clearInterval(timer);
  }, [anyProcessing, currentProject?.id, selectedStrategy, selectedStatus]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Hide clip "${title}" from this list? (Delete the source video to remove its files from the server.)`)) return;
    try {
      await api.deleteCandidate(id);
      await loadCandidates();
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published_test':
        return <span className="badge badge-amber">CANARY TEST ACTIVE</span>;
      case 'selected_for_main':
        return <span className="badge badge-green">PROVEN VIRAL WINNER</span>;
      case 'published_main':
        return <span className="badge badge-blue">PUBLISHED TO MAIN</span>;
      case 'approved_for_testing':
        return <span className="badge badge-purple">APPROVED FOR TEST</span>;
      case 'ready_for_review':
        return <span className="badge badge-green">READY</span>;
      case 'draft':
        return <span className="badge badge-amber">PROCESSING</span>;
      default:
        return <span className="badge badge-neutral">{status.replace('_', ' ').toUpperCase()}</span>;
    }
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5">
        <div className="page-header-text">
          <h1 className="heading-2">Candidate Clips Pool</h1>
          <p className="caption text-secondary">
            Ranked vertical clips selected by ClipContext, with grounded titles, descriptions and hashtags.
          </p>
        </div>

        {/* View toggle */}
        <div className="page-header-actions">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : ''}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : ''}`}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card p-4 mb-6 flex gap-4 align-center" style={{ flexWrap: 'wrap' }}>
        <div className="flex align-center gap-2">
          <Filter size={15} color="var(--text-3)" />
          <span className="caption" style={{ fontWeight: 600 }}>Hook Angle:</span>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            className="select"
            style={{ width: '180px', padding: '4px 8px', fontSize: '12px', minHeight: 'auto' }}
          >
            <option value="all">All hook types</option>
            <option value="question">Question</option>
            <option value="bold_claim">Bold Claim</option>
            <option value="statistic">Statistic</option>
            <option value="story">Story</option>
            <option value="contrast">Contrast</option>
            <option value="how_to">How-to</option>
            <option value="emotional">Emotional</option>
            <option value="none">None</option>
          </select>
        </div>

        <div className="flex align-center gap-2">
          <span className="caption" style={{ fontWeight: 600 }}>Status:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="select"
            style={{ width: '180px', padding: '4px 8px', fontSize: '12px', minHeight: 'auto' }}
          >
            <option value="all">All</option>
            <option value="draft">Processing</option>
            <option value="ready_for_review">Ready</option>
          </select>
        </div>

        <div className="caption text-muted" style={{ marginLeft: 'auto' }}>
          {candidates.length} clips
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-auto gap-4">
          {candidates.map((cand) => (
            <div
              key={cand.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overflow: 'hidden',
              }}
            >
              {/* Card Header & Preview Placeholder */}
              <div
                style={{
                  height: '140px',
                  background: cand.thumbnail_url
                    ? `linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.6)), url("${cand.thumbnail_url}") center / cover`
                    : 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
                  position: 'relative',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                className="divider-bottom"
              >
                <div className="flex flex-between align-center">
                  <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                    {cand.hook_strategy.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="badge badge-blue" style={{ fontSize: '10px' }}>
                    Score: {cand.ranking_score}
                  </span>
                </div>

                <div className="flex flex-between align-end">
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {Math.round(cand.end_time - cand.start_time)}s • {cand.aspect_ratio}
                  </div>
                  {getStatusBadge(cand.lifecycle_status)}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex flex-col flex-between flex-1">
                <div>
                  <div className="caption text-muted mb-1">
                    {cand.variant_name}
                  </div>
                  <h3 className="heading-3 mb-2" style={{ lineHeight: 1.4 }}>
                    {cand.title}
                  </h3>
                  <p className="caption text-secondary mb-3" style={{ minHeight: '34px' }}>
                    {cand.description || cand.hook_rationale}
                  </p>

                  <div className="flex gap-1 mb-3" style={{ flexWrap: 'wrap' }}>
                    {cand.hashtags?.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="badge badge-neutral" style={{ fontSize: '9px' }}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="caption text-muted mb-4">
                    Grounded: {cand.grounding_source_timecode}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 divider-top">
                  <button
                    onClick={() => onOpenEditor(cand.id)}
                    className="btn btn-primary btn-sm flex-1"
                  >
                    <Scissors size={13} />
                    <span>Edit Cut</span>
                  </button>

                  <button
                    onClick={() => onOpenTestStudio(cand.id)}
                    className="btn btn-sm flex-1"
                    title="Preview Test Publication"
                  >
                    <Send size={13} />
                    <span>Test Post</span>
                  </button>

                  <button
                    onClick={() => setDetailClipId(cand.id)}
                    className="btn btn-sm"
                    style={{ padding: '6px 8px' }}
                    title="Video, metadata & evidence"
                  >
                    <Eye size={13} />
                  </button>

                  {cand.download_url && (
                    <a
                      href={api.clipDownloadUrl(cand.id)}
                      className="btn btn-sm"
                      style={{ padding: '6px 8px' }}
                      title="Download MP4"
                      download
                    >
                      <Download size={13} />
                    </a>
                  )}

                  <button
                    onClick={() => handleDelete(cand.id, cand.title)}
                    className="btn btn-danger btn-sm"
                    style={{ padding: '6px 8px' }}
                    title="Hide clip"
                  >
                    <EyeOff size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="card p-4">
          <table className="table">
            <thead>
              <tr>
                <th>Variant</th>
                <th>Title & Hook</th>
                <th>Strategy</th>
                <th>Duration</th>
                <th>Ranking</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((cand) => (
                <tr key={cand.id}>
                  <td style={{ fontWeight: 600 }}>{cand.variant_name}</td>
                  <td style={{ maxWidth: '300px' }}>
                    <div style={{ fontWeight: 600 }}>{cand.title}</div>
                    <div className="caption text-muted">{cand.grounding_source_timecode}</div>
                  </td>
                  <td>
                    <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                      {cand.hook_strategy.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>{Math.round(cand.end_time - cand.start_time)}s</td>
                  <td>
                    <span className="badge badge-blue" style={{ fontSize: '10px' }}>
                      {cand.ranking_score}
                    </span>
                  </td>
                  <td>{getStatusBadge(cand.lifecycle_status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="flex gap-2" style={{ display: 'inline-flex' }}>
                      <button
                        onClick={() => setDetailClipId(cand.id)}
                        className="btn btn-sm"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => onOpenEditor(cand.id)}
                        className="btn btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onOpenTestStudio(cand.id)}
                        className="btn btn-primary btn-sm"
                      >
                        Publish Test
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailClipId && (
        <ClipDetailModal clipId={detailClipId} onClose={() => setDetailClipId(null)} />
      )}
    </div>
  );
};
