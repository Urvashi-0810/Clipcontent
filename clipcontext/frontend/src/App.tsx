import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ImportModal } from './components/ImportModal';
import { OverviewDashboard } from './screens/OverviewDashboard';
import { ProjectsView } from './screens/ProjectsView';
import { SourceMediaLibrary } from './screens/SourceMediaLibrary';
import { SourceVideoDetail } from './screens/SourceVideoDetail';
import { CandidateClipsView } from './screens/CandidateClipsView';
import { VideoEditorView } from './screens/VideoEditorView';
import { VariantComparisonView } from './screens/VariantComparisonView';
import { TestPublishingStudio } from './screens/TestPublishingStudio';
import { ConnectedAccountsView } from './screens/ConnectedAccountsView';
import { PublishingQueueView } from './screens/PublishingQueueView';
import { CanaryPerformanceAnalyticsView } from './screens/CanaryPerformanceAnalyticsView';
import { MainChannelPromotionView } from './screens/MainChannelPromotionView';
import { ProcessingJobsView } from './screens/ProcessingJobsView';
import { IntegrationSettingsView } from './screens/IntegrationSettingsView';
import { ApplicationSettingsView } from './screens/ApplicationSettingsView';
import { DocumentationView } from './screens/DocumentationView';

import { Project } from './types';
import { api } from './services/api';

export function App() {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load initial projects
  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load initial projects:', err);
    }
  };

  useEffect(() => {
    loadProjects();
    const savedTheme = localStorage.getItem('autoclip_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('autoclip_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const handleNavigate = (view: string, candidateId?: string) => {
    if (candidateId) {
      setActiveCandidateId(candidateId);
    }
    setCurrentView(view);
  };

  const handleOpenEditor = (candidateId?: string, sourceId?: string) => {
    if (candidateId) {
      setActiveCandidateId(candidateId);
      setCurrentView('editor');
    } else if (sourceId) {
      setActiveSourceId(sourceId);
      // If no candidate specified, navigate to candidate view or create one
      setCurrentView('candidates');
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => handleNavigate(view)}
        activeCandidateId={activeCandidateId}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="main-content">
        <Topbar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => setSelectedProjectId(id)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenUpload={() => setShowImportModal(true)}
          onNavigateDocs={() => handleNavigate('docs')}
        />

        {/* Dynamic View Rendering (16 Complete Screens) */}
        {currentView === 'dashboard' && (
          <OverviewDashboard
            currentProject={currentProject}
            onNavigate={handleNavigate}
            onOpenUpload={() => setShowImportModal(true)}
          />
        )}

        {currentView === 'projects' && (
          <ProjectsView
            currentProject={currentProject}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setCurrentView('dashboard');
            }}
            onProjectUpdated={loadProjects}
          />
        )}

        {currentView === 'media' && (
          <SourceMediaLibrary
            currentProject={currentProject}
            onOpenUpload={() => setShowImportModal(true)}
            onSelectSource={(sId) => {
              setActiveSourceId(sId);
              setCurrentView('source_detail');
            }}
            onOpenEditorForSource={(sId) => handleOpenEditor(undefined, sId)}
          />
        )}

        {currentView === 'source_detail' && activeSourceId && (
          <SourceVideoDetail
            sourceId={activeSourceId}
            onBack={() => setCurrentView('media')}
            onOpenEditor={handleOpenEditor}
            onNavigateCandidates={() => setCurrentView('candidates')}
          />
        )}

        {currentView === 'candidates' && (
          <CandidateClipsView
            currentProject={currentProject}
            onOpenEditor={(cId) => handleOpenEditor(cId)}
            onOpenTestStudio={(cId) => handleNavigate('test_studio', cId)}
            onOpenPromotion={(cId) => handleNavigate('promotion', cId)}
          />
        )}

        {currentView === 'editor' && (
          <VideoEditorView
            candidateId={activeCandidateId || ''}
            onBack={() => setCurrentView('candidates')}
            onNavigateTestStudio={(cId) => handleNavigate('test_studio', cId)}
          />
        )}

        {currentView === 'compare' && (
          <VariantComparisonView
            currentProject={currentProject}
            onOpenEditor={(cId) => handleOpenEditor(cId)}
            onOpenTestStudio={(cId) => handleNavigate('test_studio', cId)}
          />
        )}

        {currentView === 'test_studio' && (
          <TestPublishingStudio
            currentProject={currentProject}
            candidateId={activeCandidateId}
            onNavigateEditor={(cId) => handleOpenEditor(cId)}
            onNavigateQueue={() => setCurrentView('queue')}
          />
        )}

        {currentView === 'accounts' && <ConnectedAccountsView />}

        {currentView === 'queue' && <PublishingQueueView />}

        {currentView === 'analytics' && (
          <CanaryPerformanceAnalyticsView
            currentProject={currentProject}
            onNavigatePromotion={(cId) => handleNavigate('promotion', cId)}
          />
        )}

        {currentView === 'promotion' && (
          <MainChannelPromotionView
            currentProject={currentProject}
            candidateId={activeCandidateId}
            onNavigateQueue={() => setCurrentView('queue')}
            onBack={() => setCurrentView('analytics')}
          />
        )}

        {currentView === 'jobs' && <ProcessingJobsView />}

        {currentView === 'integrations' && (
          <IntegrationSettingsView onNavigateDocs={() => handleNavigate('docs')} />
        )}

        {currentView === 'settings' && (
          <ApplicationSettingsView theme={theme} onToggleTheme={handleToggleTheme} />
        )}

        {currentView === 'docs' && <DocumentationView />}
      </div>

      {/* Global Import Video Modal */}
      {showImportModal && (
        <ImportModal
          currentProject={currentProject}
          onClose={() => setShowImportModal(false)}
          onSuccess={(sId) => {
            if (sId) {
              setActiveSourceId(sId);
              setCurrentView('source_detail');
            } else {
              setCurrentView('media');
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
