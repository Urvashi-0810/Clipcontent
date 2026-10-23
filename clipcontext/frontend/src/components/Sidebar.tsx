import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Film,
  Sparkles,
  Scissors,
  SplitSquareVertical,
  Send,
  Users2,
  ListOrdered,
  TrendingUp,
  ShieldCheck,
  Cpu,
  Sliders,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  Activity
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  activeCandidateId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  activeCandidateId,
  collapsed,
  onToggleCollapse,
}) => {
  const navSections = [
    {
      title: 'CORE WORKSPACE',
      items: [
        { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
        { id: 'projects', label: 'Projects', icon: FolderKanban },
        { id: 'media', label: 'Source Library', icon: Film },
        { id: 'candidates', label: 'Candidate Clips', icon: Sparkles },
      ],
    },
    {
      title: 'EDITING & CANARY',
      items: [
        {
          id: 'editor',
          label: 'Video Editor',
          icon: Scissors,
          badge: activeCandidateId ? 'Active' : undefined,
        },
        { id: 'compare', label: 'Variant Comparison', icon: SplitSquareVertical },
        { id: 'test_studio', label: 'Test Publishing Studio', icon: Send },
      ],
    },
    {
      title: 'DISTRIBUTION & GROWTH',
      items: [
        { id: 'accounts', label: 'Connected Accounts', icon: Users2 },
        { id: 'queue', label: 'Publishing Queue', icon: ListOrdered },
        { id: 'analytics', label: 'Canary Analytics', icon: TrendingUp },
        {
          id: 'promotion',
          label: 'Main-Channel Escalation',
          icon: ShieldCheck,
          badge: 'Safeguard',
          badgeColor: 'emerald',
        },
      ],
    },
    {
      title: 'SYSTEM & INTEGRATIONS',
      items: [
        { id: 'jobs', label: 'Processing Jobs', icon: Activity },
        { id: 'integrations', label: 'Integrations & AI Status', icon: Cpu },
        { id: 'settings', label: 'Settings', icon: Sliders },
        { id: 'docs', label: 'Documentation & Spec', icon: BookOpen },
      ],
    },
  ];

  return (
    <aside
      className="sidebar"
      style={{
        width: collapsed ? '68px' : '260px',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Brand Header */}
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <Scissors size={18} />
            </div>
            <div>
              <div className="sidebar-brand-text">
                AutoClip <span style={{ color: 'var(--blue)' }}>AI</span>
              </div>
              <div className="sidebar-brand-sub">
                Canary Growth Engine
              </div>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="sidebar-brand-icon">
            <Scissors size={18} />
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          className="btn-icon"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="sidebar-nav">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="sidebar-section mb-4">
            {!collapsed && (
              <div className="sidebar-section-title">
                {section.title}
              </div>
            )}

            <div className="flex flex-col gap-1">
              {section.items.map((item) => {
                const isActive = currentView === item.id;
                const IconComponent = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`}
                  >
                    <IconComponent size={17} className="shrink-0" />

                    {!collapsed && (
                      <span className="truncate flex-1 text-left">
                        {item.label}
                      </span>
                    )}

                    {!collapsed && item.badge && (
                      <span
                        className={`badge ${
                          (item as any).badgeColor === 'emerald' ? 'badge-green' : 'badge-blue'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Simulation Mode Indicator */}
      <div className="sidebar-footer">
        {!collapsed ? (
          <div className="sidebar-status">
            <div className="status-dot" />
            <div>
              <div className="status-label">Sandbox Active</div>
              <div className="status-sublabel">
                Simulated Canary Uploads
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div
              title="Sandbox / Simulation Mode Active"
              className="status-dot"
            />
          </div>
        )}
      </div>
    </aside>
  );
};
