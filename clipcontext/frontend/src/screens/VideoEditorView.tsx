import React, { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Scissors,
  Split,
  Trash2,
  Save,
  Download,
  Send,
  Layers,
  Smartphone,
  Square,
  Monitor,
  Volume2,
  VolumeX,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Type,
  Subtitles,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  Move
} from 'lucide-react';
import { ClipCandidate, SourceAsset, EditingSequence, ClipSegment, TextOverlay } from '../types';
import { api } from '../services/api';

interface VideoEditorViewProps {
  candidateId: string;
  onBack: () => void;
  onNavigateTestStudio: (candidateId: string) => void;
}

export const VideoEditorView: React.FC<VideoEditorViewProps> = ({
  candidateId,
  onBack,
  onNavigateTestStudio,
}) => {
  const [candidate, setCandidate] = useState<ClipCandidate | null>(null);
  const [sourceAsset, setSourceAsset] = useState<SourceAsset | null>(null);
  const [sequence, setSequence] = useState<EditingSequence | null>(null);
  const [loading, setLoading] = useState(true);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // relative to source
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  // Left panel active tab
  const [leftTab, setLeftTab] = useState<'properties' | 'safe_areas' | 'overlays' | 'transcript'>('properties');

  // History for Undo/Redo
  const [history, setHistory] = useState<EditingSequence[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Canvas / Video refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Safe area overlay toggle
  const [showSafeArea, setShowSafeArea] = useState(true);

  // Rendering feedback
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  // Load candidate & sequence
  useEffect(() => {
    async function loadEditor() {
      setLoading(true);
      try {
        const cand = await api.getCandidate(candidateId);
        setCandidate(cand);
        const src = await api.getSourceAsset(cand.source_asset_id);
        setSourceAsset(src);
        const seq = await api.getSequence(candidateId);
        setSequence(seq);
        setCurrentTime(cand.start_time);
        setHistory([seq]);
        setHistoryIndex(0);
      } catch (err) {
        console.error('Failed to load editor:', err);
      } finally {
        setLoading(false);
      }
    }
    loadEditor();
  }, [candidateId]);

  // Video playback loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (!candidate) return prev;
          const next = prev + 0.1 * playbackSpeed;
          if (next >= candidate.end_time) {
            setIsPlaying(false);
            return candidate.start_time;
          }
          return next;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, candidate?.end_time, candidate?.start_time]);

  // Push history state
  const pushState = (newSeq: EditingSequence) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push(newSeq);
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
    setSequence(newSeq);
    setSaveStatus('dirty');
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setSequence(prev);
      setSaveStatus('dirty');
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setSequence(next);
      setSaveStatus('dirty');
    }
  };

  // Aspect ratio change
  const handleAspectRatioChange = (ratio: '9:16' | '1:1' | '16:9') => {
    if (!sequence || !candidate) return;
    const updated: EditingSequence = { ...sequence, aspect_ratio: ratio };
    pushState(updated);
    setCandidate({ ...candidate, aspect_ratio: ratio });
  };

  // Split segment at playhead
  const handleSplitAtPlayhead = () => {
    if (!sequence || !candidate) return;
    const currentSegments = [...sequence.segments];
    // Find active segment containing currentTime
    const segIdx = currentSegments.findIndex((s) => currentTime > s.start && currentTime < s.end);
    if (segIdx === -1) return;

    const targetSeg = currentSegments[segIdx];
    const seg1: ClipSegment = { ...targetSeg, id: `seg_${Date.now()}_1`, end: currentTime };
    const seg2: ClipSegment = { ...targetSeg, id: `seg_${Date.now()}_2`, start: currentTime };

    currentSegments.splice(segIdx, 1, seg1, seg2);
    const updated: EditingSequence = { ...sequence, segments: currentSegments };
    pushState(updated);
  };

  // Delete segment
  const handleDeleteSegment = (id: string) => {
    if (!sequence || sequence.segments.length <= 1) return;
    const updated: EditingSequence = {
      ...sequence,
      segments: sequence.segments.filter((s) => s.id !== id),
    };
    pushState(updated);
  };

  // Add text overlay
  const handleAddTextOverlay = () => {
    if (!sequence) return;
    const newOverlay: TextOverlay = {
      id: `txt_${Date.now()}`,
      text: 'SAMPLE HOOK TEXT',
      x: 0.5,
      y: 0.25,
      start: 0,
      end: 5,
      fontSize: 24,
      color: '#FFEA00',
    };
    const updated: EditingSequence = {
      ...sequence,
      text_overlays: [...sequence.text_overlays, newOverlay],
    };
    pushState(updated);
  };

  // Save sequence to backend
  const handleSaveDraft = async () => {
    if (!sequence || !candidate) return;
    setSaveStatus('saving');
    try {
      await api.saveSequence(candidate.id, sequence);
      await api.updateCandidate(candidate.id, {
        title: candidate.title,
        description: candidate.description,
        hashtags: candidate.hashtags,
        start_time: candidate.start_time,
        end_time: candidate.end_time,
        aspect_ratio: sequence.aspect_ratio,
        crop_center_x: sequence.crop_x,
        crop_center_y: sequence.crop_y,
        crop_scale: sequence.crop_scale,
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error(err);
      setSaveStatus('dirty');
    }
  };

  // Export non-destructive render
  const handleExportRender = async () => {
    if (!candidate) return;
    setIsRendering(true);
    try {
      const res = await api.renderCandidate(candidate.id);
      setRenderedUrl(res.output_url);
      setCandidate({ ...candidate, rendered_file_url: res.output_url });
      window.location.assign(res.output_path);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setIsRendering(false);
    }
  };

  // Format seconds to mm:ss.f
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  if (loading || !candidate || !sequence) {
    return <div className="view-container">Loading video editor workspace...</div>;
  }

  const clipDuration = Math.max(1, candidate.end_time - candidate.start_time);
  const relativeCurrent = Math.max(0, currentTime - candidate.start_time);

  // Aspect ratio canvas dimensions
  const getCanvasStyles = () => {
    switch (sequence.aspect_ratio) {
      case '9:16':
        return { width: '270px', height: '480px', label: '9:16 Portrait (TikTok/Reels/Shorts)' };
      case '1:1':
        return { width: '380px', height: '380px', label: '1:1 Square (Feed)' };
      case '16:9':
        return { width: '480px', height: '270px', label: '16:9 Landscape (YouTube)' };
    }
  };
  const canvasSpec = getCanvasStyles();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--topbar-height))', overflow: 'hidden' }}>
      {/* 6.1 Top Toolbar */}
      <div className="toolbar">
        {/* Left: Back & Title Editor */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn" style={{ padding: '6px 10px' }}>
            <ArrowLeft size={15} />
            <span>Back</span>
          </button>

          <input
            type="text"
            value={candidate.title}
            onChange={(e) => {
              setCandidate({ ...candidate, title: e.target.value });
              setSaveStatus('dirty');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px dashed var(--border-active)',
              color: 'var(--text-1)',
              fontSize: '14px',
              fontWeight: 600,
              width: '320px',
              outline: 'none',
              padding: '2px 4px',
            }}
          />

          <span className="badge badge-purple caption">
            {candidate.hook_strategy.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Center: Aspect Ratio & Undo/Redo */}
        <div className="flex items-center gap-3">
          <div className="flex p-1" style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)' }}>
            {(['9:16', '1:1', '16:9'] as const).map((r) => (
              <button
                key={r}
                onClick={() => handleAspectRatioChange(r)}
                className={`btn ${sequence.aspect_ratio === r ? 'btn-primary' : ''}`}
                style={{ padding: '4px 8px', fontSize: '11px', border: 'none' }}
              >
                {r === '9:16' && <Smartphone size={13} style={{ marginRight: '4px' }} />}
                {r === '1:1' && <Square size={13} style={{ marginRight: '4px' }} />}
                {r === '16:9' && <Monitor size={13} style={{ marginRight: '4px' }} />}
                <span>{r}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="btn"
              title="Undo edit"
              style={{ padding: '6px 8px' }}
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="btn"
              title="Redo edit"
              style={{ padding: '6px 8px' }}
            >
              <RotateCw size={14} />
            </button>
          </div>
        </div>

        {/* Right: Save, Export & Approve for Canary */}
        <div className="flex items-center gap-3">
          <span className="caption" style={{ color: saveStatus === 'saved' ? '#10b981' : '#f59e0b' }}>
            {saveStatus === 'saved' ? 'Saved in this browser' : saveStatus === 'saving' ? 'Saving...' : 'Unsaved changes'}
          </span>

          <button onClick={handleSaveDraft} className="btn" style={{ padding: '6px 12px' }}>
            <Save size={14} />
            <span>Save Draft</span>
          </button>

          <button
            onClick={handleExportRender}
            disabled={isRendering}
            className="btn"
            style={{ padding: '6px 12px' }}
          >
            <Download size={14} />
            <span>{isRendering ? 'Preparing...' : 'Download MP4'}</span>
          </button>

          <button
            onClick={() => onNavigateTestStudio(candidate.id)}
            className="btn btn-primary"
            style={{ padding: '6px 14px' }}
          >
            <Send size={14} />
            <span>Approve for Canary Testing</span>
          </button>
        </div>
      </div>

      {/* Main Workspace (Left Palette, Center Preview Canvas, Right Inspector) */}
      <div className="flex flex-1" style={{ overflow: 'hidden' }}>
        {/* Left Palette */}
        <div
          className="flex-col"
          style={{
            width: '280px',
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border)',
          }}
        >
          {/* Tab Navigation */}
          <div className="tabs">
            {(['properties', 'safe_areas', 'overlays', 'transcript'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`tab ${leftTab === tab ? 'active' : ''}`}
              >
                {tab === 'safe_areas' ? 'Safe Area' : tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-4 flex-1" style={{ overflowY: 'auto' }}>
            {leftTab === 'properties' && (
              <div>
                <h4 className="heading-3 mb-3">
                  Source Asset Grounding
                </h4>
                <div className="text-secondary caption mb-2">
                  Video: <strong>{sourceAsset?.title}</strong>
                </div>
                <div className="text-muted caption mb-4">
                  Original: {sourceAsset?.width}x{sourceAsset?.height} @ {sourceAsset?.fps}fps
                </div>

                <h4 className="heading-3 mb-2">
                  Clip Segments ({sequence.segments.length})
                </h4>
                <div className="flex-col gap-2">
                  {sequence.segments.map((seg, idx) => (
                    <div
                      key={seg.id}
                      className="flex flex-between items-center caption p-2"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <span>Segment #{idx + 1}</span>
                        <div className="text-muted" style={{ fontSize: '10px' }}>
                          {formatTime(seg.start)} - {formatTime(seg.end)}
                        </div>
                      </div>
                      {sequence.segments.length > 1 && (
                        <button
                          onClick={() => handleDeleteSegment(seg.id)}
                          className="btn btn-danger"
                          style={{ padding: '3px 6px' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {leftTab === 'safe_areas' && (
              <div>
                <h4 className="heading-3 mb-2">
                  Short-Form Safe Area Guides
                </h4>
                <p className="text-secondary caption mb-3">
                  Prevents titles and subtitles from being obscured by platform UI buttons (like, comments, profile, sound title).
                </p>

                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    id="showSafeCheck"
                    checked={showSafeArea}
                    onChange={(e) => setShowSafeArea(e.target.checked)}
                  />
                  <label htmlFor="showSafeCheck" className="caption" style={{ cursor: 'pointer' }}>
                    Show Platform UI Overlay
                  </label>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">
                    Target Platform Safe Template:
                  </label>
                  <select
                    value={sequence.safe_area_platform}
                    onChange={(e) => {
                      const updated: EditingSequence = {
                        ...sequence,
                        safe_area_platform: e.target.value as any,
                      };
                      pushState(updated);
                    }}
                    className="select w-full"
                  >
                    <option value="tiktok">TikTok (Right Stack & Bottom Caption Zone)</option>
                    <option value="reels">Instagram Reels (Compact Right Rail)</option>
                    <option value="shorts">YouTube Shorts (Subscribe Button & Title Box)</option>
                  </select>
                </div>
              </div>
            )}

            {leftTab === 'overlays' && (
              <div>
                <div className="flex flex-between items-center mb-3">
                  <h4 className="heading-3">Text Overlays</h4>
                  <button onClick={handleAddTextOverlay} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }}>
                    + Add Text
                  </button>
                </div>

                <div className="flex-col gap-2">
                  {sequence.text_overlays.map((txt) => (
                    <div
                      key={txt.id}
                      className="p-2"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <input
                        type="text"
                        value={txt.text}
                        onChange={(e) => {
                          const updatedOverlays = sequence.text_overlays.map((t) =>
                            t.id === txt.id ? { ...t, text: e.target.value } : t
                          );
                          pushState({ ...sequence, text_overlays: updatedOverlays });
                        }}
                        className="input w-full mb-1"
                        style={{ fontSize: '12px' }}
                      />
                      <div className="flex flex-between items-center text-muted" style={{ fontSize: '10px' }}>
                        <span>Y: {Math.round(txt.y * 100)}%</span>
                        <button
                          onClick={() => {
                            const filtered = sequence.text_overlays.filter((t) => t.id !== txt.id);
                            pushState({ ...sequence, text_overlays: filtered });
                          }}
                          className="btn btn-danger"
                          style={{ padding: '2px 5px' }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {sequence.text_overlays.length === 0 && (
                    <div className="text-muted text-center p-4 caption">
                      No manual text overlays yet. Click "+ Add Text" to superimpose hook callouts.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6.3 Transcript Integration Boundary Placeholder */}
            {leftTab === 'transcript' && (
              <div className="alert alert-warning">
                <div className="flex items-center gap-2 mb-2" style={{ color: '#f59e0b' }}>
                  <Subtitles size={18} />
                  <span className="heading-3">
                    Captions are burned in by ClipContext
                  </span>
                </div>
                <p className="text-secondary caption mb-3" style={{ lineHeight: 1.5 }}>
                  The backend transcribes with Whisper (Groq or local) and renders word-synced captions and the hook title into the clip.
                </p>
                <div className="text-muted caption p-2" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                  Edits here (trim, crop, overlays) are saved in this browser only;<br />
                  the downloaded MP4 is the backend's render.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center Preview Canvas */}
        <div
          className="flex-col items-center p-4 flex-1"
          style={{
            background: '#070a0f',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Canvas Viewport Frame */}
          <div
            style={{
              width: canvasSpec.width,
              height: canvasSpec.height,
              background: '#000',
              borderRadius: 'var(--radius-md)',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Visual Canvas Display */}
            <div
              className="flex items-center"
              style={{
                width: '100%',
                height: '100%',
                justifyContent: 'center',
                position: 'relative',
                background: 'linear-gradient(180deg, #111827 0%, #030712 100%)',
              }}
            >
              {candidate.rendered_file_url ? (
                <video
                  ref={videoRef}
                  src={candidate.rendered_file_url}
                  poster={candidate.thumbnail_url}
                  controls
                  muted={isMuted}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                />
              ) : (
              <>
              {/* Speaker representation */}
              <div
                className="flex items-center"
                style={{
                  width: '110px',
                  height: '110px',
                  borderRadius: '50%',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '2px solid rgba(59, 130, 246, 0.4)',
                  justifyContent: 'center',
                  color: 'var(--blue)',
                  transform: `scale(${sequence.crop_scale}) translate(${(sequence.crop_x - 0.5) * 40}px, ${(sequence.crop_y - 0.5) * 40}px)`,
                }}
              >
                <div className="text-center">
                  <div className="caption" style={{ fontWeight: 700 }}>VIDEO FEED</div>
                  <div className="text-muted" style={{ fontSize: '9px' }}>{formatTime(currentTime)}</div>
                </div>
              </div>
              </>
              )}

              {/* Text Overlays Display */}
              {sequence.text_overlays.map((t) => (
                <div
                  key={t.id}
                  style={{
                    position: 'absolute',
                    top: `${t.y * 100}%`,
                    left: `${t.x * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    color: t.color,
                    fontSize: `${t.fontSize}px`,
                    fontWeight: 800,
                    textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    maxWidth: '85%',
                    lineHeight: 1.2,
                  }}
                >
                  {t.text}
                </div>
              ))}

              {/* Safe Area Guides Overlay */}
              {showSafeArea && sequence.aspect_ratio === '9:16' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    border: '1px dashed rgba(245, 158, 11, 0.4)',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Right Action Icons Simulation */}
                  <div
                    className="flex-col items-center gap-3"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      bottom: '90px',
                      opacity: 0.35,
                    }}
                  >
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff' }} />
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff' }} />
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff' }} />
                  </div>

                  {/* Bottom Caption Zone */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: '50px',
                      height: '75px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderTop: '1px dashed rgba(239, 68, 68, 0.4)',
                      padding: '4px 8px',
                      fontSize: '9px',
                      color: 'rgba(255, 255, 255, 0.5)',
                    }}
                  >
                    TikTok / Reels Caption Safe Limit
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transport Controls Bar */}
          <div
            className="flex items-center gap-4 mt-4"
            style={{
              background: 'rgba(17, 23, 38, 0.85)',
              padding: '8px 18px',
              borderRadius: '999px',
              border: '1px solid var(--border)',
            }}
          >
            {/* Step -1s */}
            <button
              onClick={() => setCurrentTime((prev) => Math.max(candidate.start_time, prev - 1.0))}
              className="btn"
              style={{ padding: '6px' }}
              title="Step -1s"
            >
              -1s
            </button>

            {/* Play/Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="btn btn-primary"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
            </button>

            {/* Step +1s */}
            <button
              onClick={() => setCurrentTime((prev) => Math.min(candidate.end_time, prev + 1.0))}
              className="btn"
              style={{ padding: '6px' }}
              title="Step +1s"
            >
              +1s
            </button>

            {/* Current relative time display */}
            <div className="mono" style={{ fontSize: '13px', fontWeight: 600, minWidth: '120px' }}>
              {formatTime(relativeCurrent)} / {formatTime(clipDuration)}
            </div>

            {/* Playback Speed */}
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="select"
              style={{ padding: '3px 6px' }}
            >
              <option value={0.5}>0.5x</option>
              <option value={1.0}>1.0x</option>
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x</option>
            </select>

            {/* Mute */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="btn"
              style={{ padding: '6px' }}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          </div>
        </div>

        {/* Right Inspector */}
        <div
          style={{
            width: '320px',
            background: 'var(--bg-surface)',
            borderLeft: '1px solid var(--border)',
            padding: '16px',
            overflowY: 'auto',
          }}
        >
          <h3 className="heading-3 mb-3">
            Inspector & Metadata
          </h3>

          {/* Timecodes */}
          <div className="form-group mb-4">
            <label className="form-label">
              TIMECODE BOUNDARIES (SECONDS)
            </label>
            <div className="grid grid-2 gap-2">
              <div>
                <span className="text-muted caption">Start:</span>
                <input
                  type="number"
                  step="0.5"
                  value={candidate.start_time}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val < candidate.end_time) {
                      setCandidate({ ...candidate, start_time: val });
                      setSaveStatus('dirty');
                    }
                  }}
                  className="input w-full"
                />
              </div>
              <div>
                <span className="text-muted caption">End:</span>
                <input
                  type="number"
                  step="0.5"
                  value={candidate.end_time}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val > candidate.start_time) {
                      setCandidate({ ...candidate, end_time: val });
                      setSaveStatus('dirty');
                    }
                  }}
                  className="input w-full"
                />
              </div>
            </div>
            <div className="text-secondary caption mt-1">
              Calculated Duration: <strong>{clipDuration.toFixed(1)}s</strong>
            </div>
          </div>

          {/* Crop Transform */}
          <div className="form-group mb-4">
            <label className="form-label">
              CANVAS CROP & SCALE
            </label>
            <div className="mb-2">
              <div className="flex flex-between caption">
                <span>Zoom Scale:</span>
                <span>{sequence.crop_scale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.0"
                step="0.05"
                value={sequence.crop_scale}
                onChange={(e) => {
                  const updated = { ...sequence, crop_scale: parseFloat(e.target.value) };
                  pushState(updated);
                }}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex flex-between caption">
                <span>Horizontal Pan:</span>
                <span>{Math.round(sequence.crop_x * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={sequence.crop_x}
                onChange={(e) => {
                  const updated = { ...sequence, crop_x: parseFloat(e.target.value) };
                  pushState(updated);
                }}
                className="w-full"
              />
            </div>
          </div>

          {/* Title Editor */}
          <div className="form-group mb-3">
            <label className="form-label">
              CANDIDATE HOOK TITLE
            </label>
            <input
              type="text"
              value={candidate.title}
              onChange={(e) => {
                setCandidate({ ...candidate, title: e.target.value });
                setSaveStatus('dirty');
              }}
              className="input w-full"
            />
          </div>

          {/* Description & Hashtags */}
          <div className="form-group mb-3">
            <label className="form-label">
              DESCRIPTION
            </label>
            <textarea
              rows={3}
              value={candidate.description}
              onChange={(e) => {
                setCandidate({ ...candidate, description: e.target.value });
                setSaveStatus('dirty');
              }}
              className="input w-full"
            />
          </div>

          <div className="form-group mb-4">
            <label className="form-label">
              HASHTAGS (COMMA-SEPARATED)
            </label>
            <input
              type="text"
              value={candidate.hashtags?.join(', ')}
              onChange={(e) => {
                const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                setCandidate({ ...candidate, hashtags: tags });
                setSaveStatus('dirty');
              }}
              className="input w-full"
            />
          </div>

          {/* Pre-publication Validation Checklist */}
          <div className="card p-3">
            <div className="text-muted caption mb-1" style={{ fontWeight: 600 }}>
              PRE-FLIGHT VALIDATION:
            </div>
            <div className="flex-col gap-1 caption">
              <div className="flex items-center gap-1" style={{ color: clipDuration <= 60 ? '#10b981' : '#f59e0b' }}>
                <CheckCircle2 size={12} />
                <span>Duration ({clipDuration.toFixed(1)}s): {clipDuration <= 60 ? 'Optimal Short' : 'Longer cut'}</span>
              </div>
              <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
                <CheckCircle2 size={12} />
                <span>Aspect Ratio ({sequence.aspect_ratio}): Supported</span>
              </div>
              <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
                <CheckCircle2 size={12} />
                <span>Source Grounding: 100% Traceable</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6.1 Bottom Timeline Panel */}
      <div
        className="flex-col"
        style={{
          height: '170px',
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Timeline Header Bar */}
        <div
          className="flex flex-between items-center px-4"
          style={{
            height: '34px',
            borderBottom: '1px solid var(--border)',
            fontSize: '12px',
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ fontWeight: 600 }}>Timeline Tracks</span>
            <button
              onClick={handleSplitAtPlayhead}
              className="btn"
              style={{ padding: '3px 8px', fontSize: '11px' }}
              title="Split active segment at playhead"
            >
              <Split size={12} />
              <span>Split at Playhead</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ZoomOut size={13} color="var(--text-3)" />
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              style={{ width: '80px' }}
            />
            <ZoomIn size={13} color="var(--text-3)" />
          </div>
        </div>

        {/* Timeline Ruler & Track Canvas */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflowX: 'auto',
            overflowY: 'hidden',
            background: 'rgba(0, 0, 0, 0.25)',
            padding: '10px 16px',
          }}
        >
          {/* Ruler ticks */}
          <div
            className="flex flex-between text-muted mono mb-1"
            style={{
              height: '18px',
              borderBottom: '1px solid var(--border)',
              fontSize: '9px',
            }}
          >
            <span>00:00</span>
            <span>00:15</span>
            <span>00:30</span>
            <span>00:45</span>
            <span>01:00</span>
            <span>01:15</span>
          </div>

          {/* Active Clip Track */}
          <div
            className="flex items-center px-2"
            style={{
              height: '56px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: 'var(--radius-sm)',
              position: 'relative',
            }}
          >
            {/* Waveform graphic visualization */}
            <div className="flex items-center gap-1 w-full" style={{ height: '36px', opacity: 0.6 }}>
              {Array.from({ length: 48 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex-1"
                  style={{
                    height: `${Math.max(15, (Math.sin(idx * 0.4) + 1.2) * 16)}px`,
                    background: 'var(--blue)',
                    borderRadius: '2px',
                  }}
                />
              ))}
            </div>

            {/* Playhead Marker */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(relativeCurrent / clipDuration) * 100}%`,
                width: '2px',
                background: '#ff0055',
                zIndex: 10,
                boxShadow: '0 0 6px #ff0055',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: '-4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#ff0055',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
