import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Cpu,
  Scissors,
  Eye,
  Download,
  RotateCcw,
  XCircle,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { SourceAsset, ClipCandidate } from '../types';
import { api } from '../services/api';
import { ClipDetailModal } from '../components/ClipDetailModal';

interface SourceVideoDetailProps {
  sourceId: string;
  onBack: () => void;
  onOpenEditor: (candidateId?: string, sourceId?: string) => void;
  onNavigateCandidates: () => void;
}

const SOURCE_STAGES = ['ingest', 'transcribe', 'scan', 'select', 'niche'];

export const SourceVideoDetail: React.FC<SourceVideoDetailProps> = ({
  sourceId,
  onBack,
  onOpenEditor,
  onNavigateCandidates,
}) => {
  const [source, setSource] = useState<SourceAsset | null>(null);
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailClipId, setDetailClipId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [src, cands] = await Promise.all([
        api.getSourceAsset(sourceId),
        api.getCandidates({ sourceAssetId: sourceId }),
      ]);
      setSource(src);
      setCandidates(cands.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load source');
    }
  };

  useEffect(() => {
    load();
  }, [sourceId]);

  const active = source && (source.analysis_status === 'pending' || source.analysis_status === 'analyzing');
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [active, sourceId]);

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!source || !window.confirm(`Delete "${source.title}" and all of its clips from the server?`)) return;
    setBusy(true);
    try {
      await api.deleteSource(source.id);
      onBack();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
      setBusy(false);
    }
  };

  if (!source) {
    return (
      <div className="view-container">
        {error ? <div className="alert alert-error">{error}</div> : 'Loading source video...'}
      </div>
    );
  }

  const stageStatus = (stage: string) => source.stages?.find((s) => s.clip_id === null && s.stage === stage);
  const statusBadge = (status?: string) => {
    if (status === 'done') return 'badge-green';
    if (status === 'error') return 'badge-red';
    if (status === 'running') return 'badge-amber';
    return 'badge-neutral';
  };

  return (
    <div className="view-container">
      {/* Back Button & Header */}
      <div className="page-header mb-5">
        <div className="flex gap-4 align-center">
          <button onClick={onBack} className="btn" style={{ padding: '8px 12px' }}>
            <ArrowLeft size={16} />
            <span>Back to Library</span>
          </button>
          <div className="page-header-text">
            <h1 className="heading-2">{source.title}</h1>
            <div className="caption text-muted">
              {source.origin === 'url' && source.source_url ? (
                <a href={source.source_url} target="_blank" rel="noreferrer">{source.source_url}</a>
              ) : 'Uploaded file'}
            </div>
          </div>
        </div>
        <div className="page-header-actions">
          <button onClick={load} className="btn btn-ghost">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error mb-4">{error}</div>}

      <div className="grid grid-2 gap-5 mb-6" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        {/* Pipeline panel */}
        <div className="card p-6">
          <div className="flex align-center gap-2 mb-4">
            <Cpu size={20} color="var(--blue)" />
            <h2 className="heading-3">Pipeline</h2>
            <span className={`badge ${source.analysis_status === 'completed' ? 'badge-green' : source.analysis_status === 'failed' ? 'badge-red' : 'badge-amber'}`}>
              {(source.backend_status || source.analysis_status).replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>

          <div className="progress-track mb-4">
            <div
              className={`progress-fill ${source.analysis_status === 'completed' ? 'progress-fill-green' : 'progress-fill-amber'}`}
              style={{ width: `${Math.min(100, source.analysis_progress)}%` }}
            />
          </div>

          <div className="grid grid-2 gap-3 mb-5">
            <div className="stat-card">
              <div className="stat-caption">DURATION</div>
              <div className="stat-value">
                {source.duration_seconds
                  ? `${Math.floor(source.duration_seconds / 60)}m ${Math.floor(source.duration_seconds % 60)}s`
                  : '–'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-caption">RESOLUTION</div>
              <div className="stat-value">{source.width ? `${source.width}x${source.height}` : '–'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-caption">LANGUAGE</div>
              <div className="stat-value">{source.language_mode === 'hinglish' ? 'Hinglish' : 'English'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-caption">CLIPS RENDERED</div>
              <div className="stat-value" style={{ color: '#10b981' }}>
                {source.clips_done ?? 0} / {source.clips_total ?? 0}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-5" style={{ flexWrap: 'wrap' }}>
            {SOURCE_STAGES.map((stage) => {
              const st = stageStatus(stage);
              return (
                <span key={stage} className={`badge ${statusBadge(st?.status)}`} title={st?.error || ''}>
                  {stage}{st?.seconds != null ? ` · ${st.seconds.toFixed(0)}s` : ''}
                </span>
              );
            })}
          </div>

          {source.analysis_error && (
            <div className="alert alert-error mb-4">{source.analysis_error}</div>
          )}

          {source.summary && (
            <div className="alert alert-info mb-4">
              <div className="body" style={{ fontWeight: 600, marginBottom: '4px' }}>Video summary</div>
              <div className="caption" style={{ lineHeight: 1.5 }}>{source.summary}</div>
            </div>
          )}

          {!!source.key_topics?.length && (
            <div className="flex gap-1 mb-5" style={{ flexWrap: 'wrap' }}>
              {source.key_topics.map((t) => (
                <span key={t} className="badge badge-purple" style={{ fontSize: '10px' }}>{t}</span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {source.analysis_status === 'failed' && (
              <button onClick={() => runAction(() => api.resumeSource(source.id))} disabled={busy} className="btn btn-primary">
                <RotateCcw size={15} />
                <span>Resume from failed stage</span>
              </button>
            )}
            {active && (
              <button
                onClick={() => runAction(() => api.cancelSource(source.id))}
                disabled={busy || source.backend_status === 'cancel_requested'}
                className="btn"
              >
                <XCircle size={15} />
                <span>{source.backend_status === 'cancel_requested' ? 'Cancelling...' : 'Cancel'}</span>
              </button>
            )}
            {!active && (
              <button onClick={handleDelete} disabled={busy} className="btn btn-danger">
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Clips from this source */}
        <div className="card p-6">
          <div className="flex flex-between align-center mb-4">
            <h2 className="heading-3">
              Clips ({candidates.length})
            </h2>
            <button onClick={onNavigateCandidates} className="btn btn-sm">
              <span>View All</span>
            </button>
          </div>

          <div className="flex flex-col gap-2" style={{ maxHeight: '520px', overflowY: 'auto' }}>
            {candidates.map((c) => (
              <div key={c.id} className="list-item">
                <div className="list-item-content">
                  <div className="flex align-center gap-2 mb-1">
                    <span className="badge badge-blue" style={{ fontSize: '9px' }}>#{c.rank}</span>
                    <span className="badge badge-purple" style={{ fontSize: '9px' }}>
                      {c.hook_strategy.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="caption text-muted">
                      {Math.round(c.end_time - c.start_time)}s • score {c.ranking_score}
                    </span>
                    {c.backend_status !== 'done' && (
                      <span className={`badge ${c.backend_status === 'error' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: '9px' }}>
                        {(c.backend_status || '').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="list-item-title">{c.title}</div>
                  <div className="list-item-subtitle">
                    {c.grounding_source_timecode}
                  </div>
                </div>

                <div className="list-item-actions flex gap-1">
                  <button onClick={() => setDetailClipId(c.id)} className="btn btn-primary btn-sm" title="Video & metadata">
                    <Eye size={13} />
                  </button>
                  {c.download_url && (
                    <a href={api.clipDownloadUrl(c.id)} className="btn btn-sm" title="Download MP4" download>
                      <Download size={13} />
                    </a>
                  )}
                  <button onClick={() => onOpenEditor(c.id)} className="btn btn-sm" title="Open in editor">
                    <Scissors size={13} />
                  </button>
                </div>
              </div>
            ))}

            {candidates.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-text">
                  {active
                    ? 'Clips appear here once the select stage finishes.'
                    : 'No clips were produced for this video.'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {detailClipId && (
        <ClipDetailModal clipId={detailClipId} onClose={() => { setDetailClipId(null); load(); }} />
      )}
    </div>
  );
};
