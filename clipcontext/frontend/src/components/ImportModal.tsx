import React, { useState } from 'react';
import {
  Upload,
  X,
  Link2,
} from 'lucide-react';
import { Project } from '../types';
import { api } from '../services/api';

interface ImportModalProps {
  currentProject: Project | null;
  onClose: () => void;
  onSuccess: (sourceId?: string) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  currentProject,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'url' | 'file'>('url');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [languageMode, setLanguageMode] = useState<'en' | 'hinglish'>('en');
  const [channelHandle, setChannelHandle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setCustomTitle(file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name);
    }
  };

  const canSubmit = mode === 'file' ? !!selectedFile : /^https?:\/\/\S+$/.test(videoUrl.trim());

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !currentProject) return;

    setIsUploading(true);
    setError(null);
    const options = { languageMode, channelHandle: channelHandle.trim() || undefined };
    try {
      const created = mode === 'file'
        ? await api.uploadMedia(currentProject.id, selectedFile!, customTitle, options)
        : await api.importFromUrl(currentProject.id, videoUrl.trim(), { ...options, title: customTitle });
      onSuccess(created.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: '520px' }}>
        <div className="modal-header flex flex-between mb-4">
          <h2 className="heading-3">
            Import Long-Form Source Video
          </h2>
          <button onClick={onClose} className="btn-icon">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p className="caption text-secondary mb-4">
            Destination Project: <strong>{currentProject?.name}</strong>. ClipContext transcribes the video,
            picks 3–10 clips, renders them 9:16 and writes grounded metadata automatically.
          </p>

          {error && (
            <div className="alert alert-error mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`btn flex-1 ${mode === 'url' ? 'btn-primary' : ''}`}
            >
              <Link2 size={14} />
              <span>From URL</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`btn flex-1 ${mode === 'file' ? 'btn-primary' : ''}`}
            >
              <Upload size={14} />
              <span>Upload File</span>
            </button>
          </div>

          <form onSubmit={handleUpload}>
            {mode === 'url' ? (
              <div className="form-group mb-4">
                <label className="form-label block font-semibold mb-1">
                  Video URL
                </label>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="input w-full"
                />
              </div>
            ) : (
              <div
                className="mb-4 text-center p-6 border-dashed border-2 rounded-lg relative cursor-pointer"
                style={{
                  borderColor: 'var(--border-active)',
                  background: 'rgba(0, 0, 0, 0.2)',
                }}
              >
                <input
                  type="file"
                  accept=".mp4,.mov,.mkv,.webm,.m4v,.avi,video/*"
                  onChange={handleFileChange}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%',
                  }}
                />
                <Upload size={36} className="mb-2 mx-auto" style={{ color: 'var(--blue)' }} />
                {selectedFile ? (
                  <div>
                    <div className="body font-semibold" style={{ color: 'var(--blue)' }}>
                      {selectedFile.name}
                    </div>
                    <div className="caption text-muted">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="body font-semibold mb-1">
                      Click to browse or drop video file here
                    </div>
                    <div className="caption text-muted">
                      MP4, MOV, MKV, WebM, M4V, AVI (30 min – 2.5 h works best)
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="form-group mb-4">
              <label className="form-label block font-semibold mb-1">
                Display Title (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. AI Keynote 2026 Part 1"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="input w-full"
              />
            </div>

            <div className="grid grid-2 gap-3 mb-5">
              <div className="form-group mb-0">
                <label className="form-label block font-semibold mb-1">
                  Language
                </label>
                <select
                  value={languageMode}
                  onChange={(e) => setLanguageMode(e.target.value as 'en' | 'hinglish')}
                  className="select w-full"
                >
                  <option value="en">English</option>
                  <option value="hinglish">Hinglish (Latin script)</option>
                </select>
              </div>
              <div className="form-group mb-0">
                <label className="form-label block font-semibold mb-1">
                  Channel handle (optional)
                </label>
                <input
                  type="text"
                  placeholder="@yourchannel"
                  value={channelHandle}
                  onChange={(e) => setChannelHandle(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="modal-footer flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className="btn btn-ghost">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isUploading}
                className="btn btn-primary"
              >
                {isUploading ? (mode === 'file' ? 'Uploading...' : 'Queuing...') : 'Import Video'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
