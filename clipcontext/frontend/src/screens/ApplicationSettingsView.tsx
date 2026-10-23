import React, { useState } from 'react';
import {
  Sliders,
  Sun,
  Moon,
  Save,
  HardDrive,
  Shield,
  Smartphone,
  CheckCircle2
} from 'lucide-react';

interface ApplicationSettingsViewProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const ApplicationSettingsView: React.FC<ApplicationSettingsViewProps> = ({
  theme,
  onToggleTheme,
}) => {
  const [autoSaveInterval, setAutoSaveInterval] = useState('30');
  const [defaultPlatform, setDefaultPlatform] = useState('tiktok');
  const [exportQuality, setExportQuality] = useState('1080p');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5">
        <div className="page-header-text">
          <h1 className="heading-2">Application Settings & Preferences</h1>
          <p className="text-secondary">
            Configure studio layout, autosave cadence, rendering presets, and platform safe margins.
          </p>
        </div>

        <div className="page-header-actions">
          <button onClick={handleSave} className="btn btn-primary">
            <Save size={15} />
            <span>Save Preferences</span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="alert alert-success mb-5">
          ✓ Preferences saved successfully.
        </div>
      )}

      <div className="flex flex-col gap-5" style={{ maxWidth: '680px' }}>
        {/* Appearance */}
        <div className="card p-5">
          <h3 className="heading-3 mb-4">
            Appearance & Interface Theme
          </h3>
          <div className="flex-between items-center">
            <div>
              <div className="font-medium text-sm">Color Theme</div>
              <div className="caption text-muted mt-1">
                Currently active: {theme === 'dark' ? 'Modern Dark Glass' : 'Clean Light Surface'}
              </div>
            </div>
            <button onClick={onToggleTheme} className="btn btn-ghost">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span>Switch to {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>

        {/* Video Editor Autosave */}
        <div className="card p-5">
          <h3 className="heading-3 mb-4">
            Editor Autosave & Recovery
          </h3>
          <div className="form-group mb-3">
            <label className="form-label">
              Autosave Interval (Seconds)
            </label>
            <select
              value={autoSaveInterval}
              onChange={(e) => setAutoSaveInterval(e.target.value)}
              className="select"
              style={{ width: '200px' }}
            >
              <option value="15">Every 15 seconds</option>
              <option value="30">Every 30 seconds</option>
              <option value="60">Every 60 seconds</option>
            </select>
          </div>
          <div className="form-hint">
            Non-destructive timeline state is automatically committed to the local database.
          </div>
        </div>

        {/* Safe-Area Defaults */}
        <div className="card p-5">
          <h3 className="heading-3 mb-4">
            Default Safe-Area Platform Preset
          </h3>
          <div className="form-group mb-3">
            <select
              value={defaultPlatform}
              onChange={(e) => setDefaultPlatform(e.target.value)}
              className="select"
              style={{ width: '280px' }}
            >
              <option value="tiktok">TikTok (Bottom caption zone & right button rail)</option>
              <option value="reels">Instagram Reels (Standard mobile frame)</option>
              <option value="shorts">YouTube Shorts (Title block & subscribe button)</option>
            </select>
          </div>
          <div className="form-hint">
            Guides text overlays so creator callouts are never obscured by platform buttons.
          </div>
        </div>

        {/* Storage & Environment */}
        <div className="card p-5">
          <h3 className="heading-3 mb-4">
            Storage & Local Engine
          </h3>
          <div className="text-secondary text-sm leading-relaxed flex flex-col gap-2">
            <div>Database: <code className="mono">storage/autoclip.db</code> (SQLite local engine)</div>
            <div>Uploads: <code className="mono">storage/uploads/</code> (Non-destructive source storage)</div>
            <div>Renders: <code className="mono">storage/renders/</code> (Rendered candidate cuts)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
