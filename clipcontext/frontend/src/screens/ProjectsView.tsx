import React, { useEffect, useState } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Calendar,
  Film,
  Sparkles,
  Search,
  Tag
} from 'lucide-react';
import { Project } from '../types';
import { api } from '../services/api';

interface ProjectsViewProps {
  currentProject: Project | null;
  onSelectProject: (id: string) => void;
  onProjectUpdated: () => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  currentProject,
  onSelectProject,
  onProjectUpdated,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTags, setNewTags] = useState('Keynote, Growth, Canary');
  const [search, setSearch] = useState('');

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const tags = newTags.split(',').map((t) => t.trim()).filter(Boolean);
      const created = await api.createProject(newName.trim(), newDesc.trim(), tags);
      setShowCreateModal(false);
      setNewName('');
      setNewDesc('');
      await loadProjects();
      onSelectProject(created.id);
      onProjectUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete project "${name}" and all associated candidates?`)) return;
    try {
      await api.deleteProject(id);
      await loadProjects();
      onProjectUpdated();
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-6 flex-between">
        <div className="page-header-text">
          <h1 className="heading-1">Workspace Projects</h1>
          <p className="text-secondary body">
            Organize long-form video archives, multi-strategy candidate variants, and canary campaigns.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <Plus size={16} />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card p-3 mb-5 flex gap-3 items-center">
        <Search size={16} className="text-muted" />
        <input
          type="text"
          placeholder="Filter projects by title or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          style={{ maxWidth: '400px' }}
        />
        <span className="caption text-muted ml-auto">
          {filtered.length} total projects
        </span>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-auto">
        {filtered.map((proj) => {
          const isSelected = currentProject?.id === proj.id;
          return (
            <div
              key={proj.id}
              className="card flex-col flex-between"
              style={{
                border: isSelected ? '1px solid var(--blue)' : undefined,
                background: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined,
              }}
            >
              <div className="p-5">
                <div className="flex-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <FolderKanban size={18} color="var(--blue)" />
                    <span className="badge badge-blue caption">
                      {proj.status.toUpperCase()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(proj.id, proj.name)}
                    className="btn btn-danger p-1"
                    title="Delete Project"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <h3 className="heading-3 mb-2">
                  {proj.name}
                </h3>
                <p className="body text-secondary mb-4" style={{ minHeight: '38px' }}>
                  {proj.description || 'No description provided.'}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {proj.tags?.map((tag, tIdx) => (
                    <span key={tIdx} className="badge badge-neutral caption">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats Footer */}
              <div className="p-5" style={{ paddingTop: 0 }}>
                <div className="flex-between py-2 mb-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="caption text-muted flex items-center gap-1">
                    <Film size={13} /> {proj.source_count} source videos
                  </span>
                  <span className="caption text-muted flex items-center gap-1">
                    <Sparkles size={13} /> {proj.candidate_count} candidates
                  </span>
                </div>

                <button
                  onClick={() => onSelectProject(proj.id)}
                  className={`btn w-full ${isSelected ? 'btn-primary' : ''}`}
                >
                  {isSelected ? 'Active Workspace' : 'Select Project'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: New Project */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal p-6" style={{ width: '460px' }}>
            <h2 className="modal-header heading-2 mb-4">
              Create New Project
            </h2>

            <form onSubmit={handleCreate} className="modal-body">
              <div className="form-group mb-4">
                <label className="form-label block heading-3 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 Podcast Series Keynotes"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label block heading-3 mb-2">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Goals, target audiences, and canary testing hypotheses..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div className="form-group mb-5">
                <label className="form-label block heading-3 mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. AI, Keynote, Growth"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div className="modal-footer flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
