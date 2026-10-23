import React from 'react';
import {
  FolderKanban,
  Search,
  Upload,
  Sun,
  Moon,
  HelpCircle,
  Bell,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { Project } from '../types';

interface TopbarProps {
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenUpload: () => void;
  onNavigateDocs: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  searchQuery,
  onSearchChange,
  theme,
  onToggleTheme,
  onOpenUpload,
  onNavigateDocs,
}) => {
  return (
    <header className="topbar flex flex-between">
      {/* Left: Project Selector */}
      <div className="topbar-left flex gap-4">
        <div className="flex gap-2">
          <FolderKanban size={16} className="text-primary" style={{ color: 'var(--blue)' }} />
          <select
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className="select"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {projects.length === 0 && (
              <option value="">
                No Projects Found
              </option>
            )}
          </select>
        </div>

        {/* Global Search */}
        <div className="flex gap-2 p-2 w-full max-w-sm rounded border bg-surface">
          <Search size={14} className="text-muted" />
          <input
            type="text"
            placeholder="Search clips, hooks, tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input search-input w-full"
          />
        </div>
      </div>

      {/* Right Controls */}
      <div className="topbar-right flex gap-3">
        {/* Quick Action Upload */}
        <button
          onClick={onOpenUpload}
          className="btn btn-primary"
        >
          <Upload size={14} />
          <span>Import Video</span>
        </button>

        {/* Canary Simulation Badge */}
        <div
          className="badge badge-green"
          title="Safe Canary Environment: Simulated distribution mode is active. No unexpected live posts."
        >
          <CheckCircle size={11} />
          <span>Canary Sandbox Active</span>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="btn-icon"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Documentation Link */}
        <button
          onClick={onNavigateDocs}
          title="Product Architecture & Handoff Docs"
          className="btn-icon"
        >
          <HelpCircle size={15} />
        </button>

        {/* Creator User Pill */}
        <div className="flex gap-2 p-1 border border-glass rounded-full bg-surface ml-1">
          <div
            className="flex items-center justify-center text-white rounded-full font-bold caption"
            style={{
              width: '24px',
              height: '24px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
            }}
          >
            A
          </div>
          <span className="caption pr-2 font-medium">
            Lead Creator
          </span>
        </div>
      </div>
    </header>
  );
};
