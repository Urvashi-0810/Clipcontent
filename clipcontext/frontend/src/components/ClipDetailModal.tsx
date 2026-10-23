import React, { useEffect, useState } from 'react';
import { X, Download, Copy, CheckCircle2, RefreshCw } from 'lucide-react';
import { ClipDetail, ClipPackage, MetadataCandidate } from '../types';
import { api, backendUrl } from '../services/api';

interface ClipDetailModalProps {
  clipId: string;
  onClose: () => void;
}

type Pool = 'title' | 'description' | 'hashtags';

/** Shows one ClipContext clip: rendered video, scores, top-5 metadata and the copy-ready package. */
export const ClipDetailModal: React.FC<ClipDetailModalProps> = ({ clipId, onClose }) => {
  const [clip, setClip] = useState<ClipDetail | null>(null);
  const [pkg, setPkg] = useState<ClipPackage | null>(null);
  const [tab, setTab] = useState<Pool | 'evidence'>('title');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    try {
      const detail = await api.getClipDetail(clipId);
      setClip(detail);
      if (detail.status === 'done') setPkg(await api.getClipPackage(clipId));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load clip');
    }
  };

  useEffect(() => {
    load();
  }, [clipId]);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Clipboard is not available in this browser.');
    }
  };

  const handleSelectTitle = async (titleId: string) => {
    try {
      await api.selectTitle(clipId, titleId, true);
      setNotice('Title chosen. Descriptions and hashtags are regenerating for it — refresh in a minute.');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRegenerate = async (pool: Pool) => {
    try {
      await api.regenerateMetadata(clipId, pool, clip?.chosen_title_id || undefined);
      setNotice(`Regenerating ${pool} — refresh in a minute.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const packageText = pkg
    ? [pkg.title, '', pkg.description, '', pkg.hashtags.join(' '), '', `Tags: ${pkg.tags.join(', ')}`].join('\n')
    : '';

  const renderCandidate = (c: MetadataCandidate, pool: Pool) => {
    const text = pool === 'hashtags' ? (c.hashtags || []).join(' ') + (c.tags?.length ? `\nTags: ${c.tags.join(', ')}` : '') : c.text || '';
    const chosen = pool === 'title' && clip?.chosen_title_id === c.id;
    return (
      <div key={c.id} className="list-item" style={{ alignItems: 'flex-start' }}>
        <div className="list-item-content">
          <div className="flex align-center gap-2 mb-1">
            {c.rank != null && <span className="badge badge-blue" style={{ fontSize: '9px' }}>#{c.rank}</span>}
            {c.strategy && <span className="badge badge-purple" style={{ fontSize: '9px' }}>{c.strategy.replace(/_/g, ' ')}</span>}
            {c.final_score != null && <span className="caption text-muted">score {Number(c.final_score).toFixed(2)}</span>}
            {!c.passed_filters && <span className="badge badge-amber" style={{ fontSize: '9px' }}>FILTERED</span>}
            {chosen && <span className="badge badge-green" style={{ fontSize: '9px' }}>CHOSEN</span>}
          </div>
          <div className="body" style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
          {c.judge_reason && <div className="caption text-muted mt-1">{c.judge_reason}</div>}
        </div>
        <div className="list-item-actions flex gap-1">
          <button className="btn btn-sm" onClick={() => copy(c.id, text)} title="Copy">
            {copied === c.id ? <CheckCircle2 size={13} /> : <Copy size={13} />}
          </button>
          {pool === 'title' && !chosen && (
            <button className="btn btn-sm btn-primary" onClick={() => handleSelectTitle(c.id)}>Use</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: '960px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header flex flex-between mb-4">
          <h2 className="heading-3">
            {clip ? `Clip #${clip.rank} — ${clip.hook_title || 'Untitled'}` : 'Loading clip...'}
          </h2>
          <div className="flex gap-2">
            <button onClick={load} className="btn-icon" title="Refresh"><RefreshCw size={16} /></button>
            <button onClick={onClose} className="btn-icon"><X size={16} /></button>
          </div>
        </div>

        {error && <div className="alert alert-error mb-4">{error}</div>}
        {notice && <div className="alert alert-info mb-4">{notice}</div>}

        {clip && (
          <div className="grid gap-5" style={{ gridTemplateColumns: '280px 1fr' }}>
            {/* Video + scores */}
            <div>
              {clip.video_url ? (
                <video
                  src={backendUrl(clip.video_url)}
                  poster={backendUrl(clip.thumb_url)}
                  controls
                  style={{ width: '100%', aspectRatio: '9 / 16', background: '#000', borderRadius: '8px' }}
                />
              ) : (
                <div className="card p-4 text-center caption text-muted" style={{ aspectRatio: '9 / 16' }}>
                  Not rendered yet — status: {clip.status}{clip.stage ? ` (${clip.stage})` : ''}
                  {clip.error && <div className="mt-2" style={{ color: '#ef4444' }}>{clip.error}</div>}
                </div>
              )}

              <div className="caption text-muted mt-3">
                {clip.t_start.toFixed(1)}s – {clip.t_end.toFixed(1)}s ({clip.duration_s}s) • hook: {clip.hook_type || 'none'}
              </div>

              <div className="grid grid-2 gap-2 mt-3">
                {(['hook', 'engagement', 'value', 'shareability'] as const).map((k) => (
                  <div key={k} className="stat-card" style={{ padding: '8px' }}>
                    <div className="stat-caption">{k.toUpperCase()}</div>
                    <div className="stat-value" style={{ fontSize: '18px' }}>{clip.scores?.[k] ?? '–'}<span className="caption text-muted">/25</span></div>
                  </div>
                ))}
              </div>
              <div className="caption mt-2">Total: <strong>{clip.scores?.total ?? '–'} / 100</strong></div>
              {clip.reasoning && <p className="caption text-secondary mt-2" style={{ lineHeight: 1.5 }}>{clip.reasoning}</p>}

              {clip.download_url && (
                <a href={api.clipDownloadUrl(clip.id)} className="btn btn-primary w-full mt-3" download>
                  <Download size={14} />
                  <span>Download MP4</span>
                </a>
              )}
            </div>

            {/* Metadata */}
            <div>
              {pkg && (
                <div className="card p-4 mb-4">
                  <div className="flex flex-between align-center mb-2">
                    <h3 className="heading-3">Copy-ready package</h3>
                    <button className="btn btn-sm btn-primary" onClick={() => copy('package', packageText)}>
                      {copied === 'package' ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                      <span>Copy all</span>
                    </button>
                  </div>
                  <div className="body font-semibold mb-1">{pkg.title}</div>
                  <div className="caption text-secondary mb-2" style={{ whiteSpace: 'pre-wrap' }}>{pkg.description}</div>
                  <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                    {pkg.hashtags.map((h) => <span key={h} className="badge badge-neutral" style={{ fontSize: '10px' }}>{h}</span>)}
                  </div>
                  {pkg.tags.length > 0 && <div className="caption text-muted mt-2">Tags: {pkg.tags.join(', ')}</div>}
                </div>
              )}

              <div className="flex gap-2 mb-3">
                {(['title', 'description', 'hashtags', 'evidence'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`}>
                    {t === 'title' ? 'Titles' : t === 'description' ? 'Descriptions' : t === 'hashtags' ? 'Hashtags' : 'Evidence'}
                  </button>
                ))}
                {tab !== 'evidence' && clip.status === 'done' && (
                  <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => handleRegenerate(tab)}>
                    <RefreshCw size={13} />
                    <span>Regenerate</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2" style={{ maxHeight: '460px', overflowY: 'auto' }}>
                {tab !== 'evidence' && (clip.metadata?.[tab] || []).map((c) => renderCandidate(c, tab))}
                {tab !== 'evidence' && !(clip.metadata?.[tab] || []).length && (
                  <div className="caption text-muted">No {tab} candidates yet.</div>
                )}
                {tab === 'evidence' && (clip.evidence || []).map((f) => (
                  <div key={f.fact_key} className="list-item" style={{ alignItems: 'flex-start' }}>
                    {f.frame_url && (
                      <img src={backendUrl(f.frame_url)} alt="" style={{ width: '96px', borderRadius: '4px', marginRight: '10px' }} />
                    )}
                    <div className="list-item-content">
                      <div className="flex gap-2 mb-1">
                        <span className="badge badge-blue" style={{ fontSize: '9px' }}>{f.fact_key}</span>
                        <span className="badge badge-neutral" style={{ fontSize: '9px' }}>{f.kind}</span>
                        <span className="caption text-muted">{f.t_start.toFixed(1)}s</span>
                      </div>
                      <div className="caption">{f.text}</div>
                    </div>
                  </div>
                ))}
                {tab === 'evidence' && !(clip.evidence || []).length && (
                  <div className="caption text-muted">No evidence facts yet.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
