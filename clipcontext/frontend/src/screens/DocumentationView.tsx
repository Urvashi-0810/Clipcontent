import React, { useState } from 'react';
import {
  BookOpen,
  FileText,
  Cpu,
  Layers,
  Send,
  Milestone,
  CheckCircle2
} from 'lucide-react';

export const DocumentationView: React.FC = () => {
  const [activeDoc, setActiveDoc] = useState<string>('handoff');

  const docs = [
    { id: 'handoff', title: 'AI Integration Handoff', subtitle: 'Interface contracts for incoming teammate', icon: Cpu },
    { id: 'spec', title: 'Product Specification', subtitle: 'Requirements grounded in Slides 11–18', icon: FileText },
    { id: 'arch', title: 'Architecture Document', subtitle: 'Pipeline data flow & schemas', icon: Layers },
    { id: 'guide', title: 'User Workflow Guide', subtitle: 'End-to-end creator tutorial', icon: BookOpen },
    { id: 'publishing', title: 'Publishing Integrations', subtitle: 'Canary sandbox & API limitations', icon: Send },
    { id: 'roadmap', title: 'Development Roadmap', subtitle: '7-phase delivery milestones', icon: Milestone },
  ];

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5">
        <div className="page-header-text">
          <h1 className="heading-2">Technical Documentation & Specifications</h1>
          <p className="text-secondary">
            Complete architectural specifications, source presentation mapping (Slides 11–18), and teammate AI integration handoff.
          </p>
        </div>
      </div>

      <div className="grid grid-2/3 gap-5">
        {/* Doc Nav Rail */}
        <div className="card p-4 flex flex-col gap-2">
          {docs.map((doc) => {
            const Icon = doc.icon;
            const isSelected = activeDoc === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => setActiveDoc(doc.id)}
                className={`nav-item ${isSelected ? 'active' : ''} text-left flex items-start gap-3 p-3 rounded transition-colors ${isSelected ? 'bg-[var(--blue)]/10 border border-[var(--blue)]/30 text-[var(--blue)]' : 'hover:bg-surface/50 border border-transparent'}`}
                style={{
                  border: isSelected ? '1px solid var(--blue)' : '1px solid transparent',
                  background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                }}
              >
                <Icon size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-sm">{doc.title}</div>
                  <div className="caption text-muted opacity-75">{doc.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Doc Content Viewer */}
        <div className="card p-7 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {activeDoc === 'handoff' && (
            <div>
              <span className="badge badge-amber mb-3 block w-fit">
                FOR TEAMMATE: AI INTEGRATION HANDOFF
              </span>
              <h2 className="heading-2 mb-3">
                AI / LLM / RAG / Transcript Integration Boundary
              </h2>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                This document specifies the deliberate team-development boundary established for AutoClip AI.
                All core workflows (video editing, timeline trimming, candidate variant management, canary publishing, and promotion safeguards) are fully implemented and operational.
              </p>

              <h3 className="heading-3 mt-6 mb-2">
                1. Provider Interfaces & Code Locations
              </h3>
              <ul className="list-disc pl-5 text-secondary text-sm leading-relaxed mb-4 space-y-1">
                <li><code className="mono">backend/app/services/transcript_provider.py</code> (Whisper / ASR audio transcription)</li>
                <li><code className="mono">backend/app/services/clip_generation_provider.py</code> (Stage 2: LLM Candidate Proposal from 10 Hook Strategies)</li>
                <li><code className="mono">backend/app/services/candidate_ranking_provider.py</code> (Stage 3: Discriminator Ranking & Benchmark alignment)</li>
                <li><code className="mono">backend/app/services/source_grounding_provider.py</code> (100% Anti-Hallucination Source Traceability)</li>
                <li><code className="mono">backend/app/services/trend_analysis_provider.py</code> (Short-form niche benchmark scraping)</li>
                <li><code className="mono">backend/app/services/creator_voice_profile_provider.py</code> (Few-shot tone and lexical profile matching)</li>
              </ul>

              <h3 className="heading-3 mt-6 mb-2">
                2. Honest State Protocol
              </h3>
              <p className="text-secondary text-sm leading-relaxed mb-3">
                All mock outputs are explicitly tagged with <code className="mono">is_mock: True</code>. Placeholders display honest states (e.g. <em>Awaiting Implementation</em>) rather than fabricating real AI results.
              </p>
            </div>
          )}

          {activeDoc === 'spec' && (
            <div>
              <span className="badge badge-blue mb-3 block w-fit">
                PRODUCT SPECIFICATION
              </span>
              <h2 className="heading-2 mb-3">
                AutoClip AI: Multi-Variant Video Clipping & Growth Engine
              </h2>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                Source of Truth: AutoClip AI section of the supplied presentation, pages 11–18.
              </p>

              <h3 className="heading-3 mb-2">The Creator Distribution Problem (Slide 12)</h3>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                Publishing unverified clips directly harms main channel algorithmic reach. Single video edits miss diverse psychological audience triggers.
                Canary testing on secondary accounts surfaces mathematically proven viral hits before main-channel exposure.
              </p>

              <h3 className="heading-3 mb-2">The 4-Stage Architecture</h3>
              <ol className="list-decimal pl-5 text-secondary text-sm leading-relaxed space-y-1">
                <li><strong>Stage 1 (Slide 13):</strong> Local-First Multimodal Analysis (Vocal pause detection, 1 FPS frame scanning, cost-optimized silence elimination).</li>
                <li><strong>Stage 2 (Slide 14):</strong> Multi-Strategy Candidate Generation (10 psychological hook angles, visual grounding, creator voice alignment).</li>
                <li><strong>Stage 3 (Slide 15):</strong> Discriminator Ranking & Trend Mining (10x candidate pools, top 5 selected, independent AI ranking with explicit reasoning).</li>
                <li><strong>Stage 4 (Slide 16-17):</strong> Multi-Clip Canary Distribution & Safeguarded Main Dispatch.</li>
              </ol>
            </div>
          )}

          {activeDoc === 'arch' && (
            <div>
              <span className="badge badge-purple mb-3 block w-fit">
                SYSTEM ARCHITECTURE
              </span>
              <h2 className="heading-2 mb-3">
                Full-Stack Architecture & Data Pipeline
              </h2>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                Desktop-first responsive client built with React 19 + TypeScript + Vite, backed by a modular FastAPI + SQLAlchemy engine with SQLite storage.
              </p>
              <h3 className="heading-3 mb-2">Non-Destructive Editing Engine</h3>
              <p className="text-secondary text-sm leading-relaxed">
                Source videos are never modified. The client commits sequence schemas (in/out timecodes, split segments, crop transforms, and text overlays) to the backend. Rendering produces isolated MP4 files in <code className="mono">storage/renders/</code>.
              </p>
            </div>
          )}

          {activeDoc === 'guide' && (
            <div>
              <span className="badge badge-green mb-3 block w-fit">
                USER WORKFLOW GUIDE
              </span>
              <h2 className="heading-2 mb-3">
                How to Use AutoClip AI
              </h2>
              <ol className="list-decimal pl-5 text-secondary text-sm leading-relaxed space-y-2">
                <li><strong>Import Source Video:</strong> Click "Import Video" to load a local podcast or keynote.</li>
                <li><strong>Stage 1 Inspection:</strong> View local-first vocal pauses and frame diversity metrics.</li>
                <li><strong>Generate / Edit Candidates:</strong> Open any candidate in the Full Video Editor to adjust in/out markers, split segments, or add text overlays.</li>
                <li><strong>Test Publishing Studio:</strong> Preview the cut in the phone frame and publish to a secondary Canary account.</li>
                <li><strong>Monitor Analytics:</strong> Track early engagement velocity and completion rates.</li>
                <li><strong>Creator-Approved Escalation:</strong> Review verified viral metrics and confirm main-channel promotion with explicit acknowledgement.</li>
              </ol>
            </div>
          )}

          {activeDoc === 'publishing' && (
            <div>
              <span className="badge badge-blue mb-3 block w-fit">
                PUBLISHING INTEGRATIONS
              </span>
              <h2 className="heading-2 mb-3">
                Canary Distribution & Account Safeguards
              </h2>
              <p className="text-secondary text-sm leading-relaxed mb-3">
                AutoClip AI strictly partitions accounts into <strong>Canary Test Accounts</strong> and <strong>Protected Main Channels</strong>.
              </p>
              <p className="text-secondary text-sm leading-relaxed">
                Simulation mode is enabled by default to allow end-to-end testing without external API credentials or unintended social posts.
              </p>
            </div>
          )}

          {activeDoc === 'roadmap' && (
            <div>
              <span className="badge badge-purple mb-3 block w-fit">
                ROADMAP & DELIVERY MILESTONES
              </span>
              <h2 className="heading-2 mb-3">
                7-Phase Development Plan
              </h2>
              <ul className="list-none pl-2 text-secondary text-sm leading-relaxed space-y-1">
                <li>✓ <strong>Phase 1:</strong> Application Foundation & Liquid Glass Design System</li>
                <li>✓ <strong>Phase 2:</strong> Source Media Library & Functional Video Editor</li>
                <li>✓ <strong>Phase 3:</strong> Candidate & 10-Hook Variant Management</li>
                <li>✓ <strong>Phase 4:</strong> Test Publishing Studio & Canary Pipeline</li>
                <li>✓ <strong>Phase 5:</strong> Canary Analytics & Main-Channel Safeguards</li>
                <li>⏳ <strong>Phase 6:</strong> AI / LLM / RAG / Whisper Integration by designated teammate</li>
                <li>⏳ <strong>Phase 7:</strong> Production Multi-Tenant Cloud Deployment</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
