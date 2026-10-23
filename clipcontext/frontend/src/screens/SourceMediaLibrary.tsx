import React, { useEffect, useState } from 'react';
import {
  Film,
  Upload,
  Play,
  Scissors,
  Cpu,
  Clock,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Info,
  RotateCcw,
  XCircle,
  Trash2
} from 'lucide-react';
import { SourceAsset, Project } from '../types';
import { api } from '../services/api';

interface SourceMediaLibraryProps {
  currentProject: Project | null;
  onOpenUpload: () => void;
  onSelectSource: (sourceId: string) => void;
  onOpenEditorForSource: (sourceId: string) => void;
}

export const SourceMediaLibrary: React.FC<SourceMediaLibraryProps> = ({
  currentProject,
  onOpenUpload,
  onSelectSource,
  onOpenEditorForSource,
}) => {
  const [sources, setSources] = useState<SourceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const loadSources = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await api.getSourceAssets(currentProject?.id);
      setSources(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, [currentProject?.id]);

  // Poll while any video is still being processed by the worker
  const anyActive = sources.some((s) => s.analysis_status === 'pending' || s.analysis_status === 'analyzing');
  useEffect(() => {
    if (!anyActive) return;
    const timer = setInterval(() => loadSources(true), 5000);
    return () => clearInterval(timer);
  }, [anyActive, currentProject?.id]);

  const runAction = async (assetId: string, action: () => Promise<unknown>) => {
    setAnalyzingId(assetId);
    setActionError(null);
    try {
      await action();
      await loadSources(true);
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleRunAnalysis = (assetId: string) => runAction(assetId, () => api.resumeSource(assetId));
  const handleCancel = (assetId: string) => runAction(assetId, () => api.cancelSource(assetId));
  const handleDelete = (src: SourceAsset) => {
    if (!window.confirm(`Delete "${src.title}" and all of its clips from the server?`)) return;
    runAction(src.id, () => api.deleteSource(src.id));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const sourceInfo = (src: SourceAsset) => {
    const parts = [src.origin === 'url' ? 'URL import' : 'Upload'];
    if (src.width && src.height) parts.push(`${src.width}x${src.height}`);
    if (src.language_mode) parts.push(src.language_mode === 'hinglish' ? 'Hinglish' : 'English');
    return parts.join(' • ');
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5 flex-between">
        <div className="page-header-text">
          <h1 className="heading-1">Source Media Library</h1>
          <p className="text-secondary body">
            Long videos processed by ClipContext: ingest → transcribe → scan → select → niche, then evidence, render and metadata per clip.
          </p>
        </div>

        <div className="page-header-actions">
          <button onClick={onOpenUpload} className="btn btn-primary">
            <Upload size={16} />
            <span>Import Video File</span>
          </button>
        </div>
      </div>

      {/* Stage 1 Informational Callout */}
      <div className="card p-4 mb-6 flex gap-3 items-center" style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <Cpu size={20} color="var(--blue)" className="flex-shrink-0" />
        <div className="caption text-secondary" style={{ lineHeight: 1.5 }}>
          <strong className="text-1">Processing is automatic: </strong>
          the backend worker (<code>python -m app.worker</code>) picks up each import, and this page refreshes until it finishes.
        </div>
      </div>

      {actionError && <div className="alert alert-error mb-4">{actionError}</div>}

      {/* Sources Grid */}
      <div className="grid grid-auto">
        {sources.map((src) => {
          const isAnalyzing = analyzingId === src.id;
          return (
            <div
              key={src.id}
              className="card flex-col flex-between overflow-hidden"
            >
              {/* Media Thumbnail Container */}
              <div
                className="thumbnail relative flex items-center justify-center border-b border-glass"
                style={{
                  height: '160px',
                  background: src.thumbnail_url
                    ? `url("${src.thumbnail_url}") center / cover`
                    : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                }}
              >
                {!src.thumbnail_url && <Film size={44} color="rgba(255, 255, 255, 0.2)" />}

                {/* Duration Badge */}
                <div className="absolute bottom-2 right-2 bg-black/75 px-2 py-1 rounded caption font-semibold flex items-center gap-1 text-white">
                  <Clock size={11} />
                  <span>{formatDuration(src.duration_seconds)}</span>
                </div>

                {/* Demo Asset Flag */}
                {src.is_demo_asset && (
                  <div className="absolute top-2 left-2">
                    <span className="badge badge-purple caption">
                      DEMO ASSET
                    </span>
                  </div>
                )}
              </div>

              {/* Media Info */}
              <div className="p-4 flex-1 flex-col flex-between">
                <div>
                  <h3 className="heading-3 mb-1">
                    {src.title}
                  </h3>
                  <div className="caption text-muted mb-3">
                    {sourceInfo(src)}
                  </div>

                  {/* Stage 1 Analysis Results Pill */}
                  <div className="p-3 rounded-sm bg-black/20 border border-glass mb-4 caption">
                    <div className="flex-between mb-1">
                      <span className="text-muted">Pipeline:</span>
                      <span className={`badge ${src.analysis_status === 'completed' ? 'badge-green' : src.analysis_status === 'failed' ? 'badge-red' : 'badge-amber'}`}>
                        {(src.backend_status || src.analysis_status).replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>

                    {src.analysis_status === 'completed' ? (
                      <div className="flex-between text-secondary">
                        <span>{src.candidate_count} clips</span>
                        <span>{src.clips_done}/{src.clips_total} rendered</span>
                      </div>
                    ) : src.analysis_status === 'failed' ? (
                      <div style={{ color: '#ef4444' }}>
                        {src.analysis_error || 'Processing stopped'}
                      </div>
                    ) : (
                      <div className="text-muted">
                        {src.backend_stage ? `Stage: ${src.backend_stage}` : 'Waiting for the worker'} • {Math.round(src.analysis_progress)}%
                        {src.clips_total ? ` • clips ${src.clips_done}/${src.clips_total}` : ''}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {src.analysis_status === 'failed' ? (
                    <button
                      onClick={() => handleRunAnalysis(src.id)}
                      disabled={isAnalyzing}
                      className="btn btn-primary flex-1 btn-sm"
                    >
                      <RotateCcw size={14} />
                      <span>{isAnalyzing ? 'Resuming...' : 'Resume'}</span>
                    </button>
                  ) : src.analysis_status !== 'completed' ? (
                    <button
                      onClick={() => handleCancel(src.id)}
                      disabled={isAnalyzing || src.backend_status === 'cancel_requested'}
                      className="btn flex-1 btn-sm"
                    >
                      <XCircle size={14} />
                      <span>{src.backend_status === 'cancel_requested' ? 'Cancelling...' : 'Cancel'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onSelectSource(src.id)}
                      className="btn flex-1 btn-sm"
                    >
                      <Info size={14} />
                      <span>Details</span>
                    </button>
                  )}

                  <button
                    onClick={() => onOpenEditorForSource(src.id)}
                    className="btn btn-primary flex-1 btn-sm"
                  >
                    <Scissors size={14} />
                    <span>View Clips</span>
                  </button>

                  {(src.analysis_status === 'completed' || src.analysis_status === 'failed') && (
                    <button
                      onClick={() => handleDelete(src)}
                      disabled={isAnalyzing}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '6px 8px' }}
                      title="Delete video and clips"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sources.length === 0 && !loading && (
        <div className="card p-12 text-center mt-5 empty-state">
          <Film size={48} className="mx-auto mb-4 opacity-40 empty-state-icon" />
          <h3 className="heading-2 text-1 mb-2 empty-state-title">
            No Videos in this Project
          </h3>
          <p className="body text-2 mx-auto mb-5 max-w-md empty-state-text">
            Import a podcast, lecture or keynote (URL or file) and ClipContext will turn it into ranked vertical clips.
          </p>
          <button onClick={onOpenUpload} className="btn btn-primary">
            <Upload size={15} />
            <span>Import Your First Video</span>
          </button>
        </div>
      )}
    </div>
  );
};
