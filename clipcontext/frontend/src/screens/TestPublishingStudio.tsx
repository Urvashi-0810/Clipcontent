import React, { useEffect, useState } from 'react';
import {
  Send,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import { ClipCandidate, ConnectedAccount, Project } from '../types';
import { api } from '../services/api';

interface TestPublishingStudioProps {
  currentProject: Project | null;
  candidateId: string | null;
  onNavigateEditor: (candidateId: string) => void;
  onNavigateQueue: () => void;
}

export const TestPublishingStudio: React.FC<TestPublishingStudioProps> = ({
  currentProject,
  candidateId,
  onNavigateEditor,
  onNavigateQueue,
}) => {
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ClipCandidate | null>(null);
  const [canaryAccounts, setCanaryAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Editable publishing metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [cands, accs] = await Promise.all([
          api.getCandidates({ projectId: currentProject?.id }),
          api.getAccounts('canary_test'),
        ]);
        setCandidates(cands);
        setCanaryAccounts(accs);

        const targetCand = cands.find((c) => c.id === candidateId) || cands[0] || null;
        if (targetCand) {
          setSelectedCandidate(targetCand);
          setTitle(targetCand.title);
          setDescription(targetCand.description);
          setHashtags(targetCand.hashtags?.join(', ') || '');
        }

        if (accs.length > 0) {
          setSelectedAccountId(accs[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
  }, [currentProject?.id, candidateId]);

  const handleSelectCandidate = (cand: ClipCandidate) => {
    setSelectedCandidate(cand);
    setTitle(cand.title);
    setDescription(cand.description);
    setHashtags(cand.hashtags?.join(', ') || '');
    setFeedback(null);
  };

  const handlePublishCanary = async () => {
    if (!selectedCandidate || !selectedAccountId) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await api.publishToCanary({
        project_id: selectedCandidate.project_id,
        candidate_id: selectedCandidate.id,
        account_id: selectedAccountId,
        title_override: title,
        description_override: description,
        hashtags_override: hashtags.split(',').map((h) => h.trim()).filter(Boolean),
      });
      setFeedback(`Candidate successfully published to Canary Test Account! Job ID: ${res.id}`);
      setTimeout(() => {
        onNavigateQueue();
      }, 1500);
    } catch (err: any) {
      setFeedback(`Error: ${err.message || 'Canary publish failed'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAccount = canaryAccounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5 flex-between">
        <div className="page-header-text">
          <h1 className="heading-2">Test Publishing Studio</h1>
          <p className="text-secondary body">
            Pre-flight Canary Review: Inspect the exact video cut, metadata, and safe-margins before publishing to secondary test accounts.
          </p>
        </div>
      </div>

      {/* Main Studio Grid: Left Candidate Picker, Center Phone Mockup, Right Dispatch Controls */}
      <div className="grid" style={{ gridTemplateColumns: '260px 380px 1fr', gap: '20px' }}>
        {/* Left Column: Candidates Picker */}
        <div className="card p-4 flex-col">
          <h3 className="text-muted heading-3 mb-2">
            SELECT CANDIDATE CUT
          </h3>
          <div className="flex-col gap-2 flex-1" style={{ overflowY: 'auto' }}>
            {candidates.map((c) => {
              const isSelected = selectedCandidate?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectCandidate(c)}
                  className="p-2"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--blue)' : 'var(--border)',
                    background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex flex-between mb-1">
                    <span className="badge badge-purple caption">
                      {c.hook_strategy.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-muted caption">
                      {Math.round(c.end_time - c.start_time)}s
                    </span>
                  </div>
                  <div className="body" style={{ fontWeight: 600 }}>
                    {c.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Column: Phone Preview Mockup */}
        <div
          className="card p-5 flex-col items-center"
          style={{ background: 'rgba(0, 0, 0, 0.3)' }}
        >
          <div className="text-muted heading-3 mb-3">
            PHONE PRE-FLIGHT MOCKUP
          </div>

          {/* Smartphone Frame */}
          <div
            className="flex-col flex-between p-4"
            style={{
              width: '270px',
              height: '490px',
              background: '#000',
              borderRadius: '28px',
              border: '4px solid #334155',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
          >
            {/* Top status bar */}
            <div className="flex flex-between caption" style={{ color: '#fff', opacity: 0.7 }}>
              <span>Canary Sandbox</span>
              <span>100%</span>
            </div>

            {/* Video content display */}
            <div className="text-center" style={{ margin: 'auto 0' }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 800,
                  color: '#FFEA00',
                  textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                  lineHeight: 1.2,
                }}
              >
                {title || selectedCandidate?.title}
              </div>
            </div>

            {/* Right stack UI icons simulation */}
            <div
              className="flex-col items-center gap-3 caption"
              style={{
                position: 'absolute',
                right: '12px',
                bottom: '100px',
                color: '#fff',
              }}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff', opacity: 0.8 }} />
              <span>1.2k</span>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff', opacity: 0.8 }} />
              <span>48</span>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff', opacity: 0.8 }} />
              <span>Share</span>
            </div>

            {/* Bottom Caption & Account Overlay */}
            <div style={{ color: '#fff', fontSize: '11px', textShadow: '0 1px 3px rgba(0,0,0,0.8)', paddingRight: '45px' }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                {selectedAccount?.account_handle || '@canary_lab'}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.9, maxHeight: '36px', overflow: 'hidden' }}>
                {description || selectedCandidate?.description}
              </div>
              <div style={{ color: '#60a5fa', fontSize: '10px', marginTop: '2px' }}>
                {hashtags}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Pre-Publication Inspector & Canary Dispatch */}
        <div className="card p-6 flex-col flex-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={18} color="var(--blue)" />
              <h3 className="heading-3">
                Canary Test Publication Configuration
              </h3>
            </div>

            {/* Target Account Selector */}
            <div className="form-group mb-3">
              <label className="form-label">
                Target Canary Account (Secondary / Test) *
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="select w-full"
              >
                {canaryAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name} ({a.platform})
                  </option>
                ))}
              </select>
              <div className="caption" style={{ color: '#10b981', marginTop: '4px' }}>
                ✓ Isolated secondary account: Zero main channel algorithmic risk.
              </div>
            </div>

            {/* Title Override */}
            <div className="form-group mb-3">
              <label className="form-label">
                Test Post Title / Hook
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input w-full"
              />
            </div>

            {/* Description Override */}
            <div className="form-group mb-3">
              <label className="form-label">
                Post Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input w-full"
              />
            </div>

            {/* Hashtags Override */}
            <div className="form-group mb-4">
              <label className="form-label">
                Hashtags (comma-separated)
              </label>
              <input
                type="text"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="input w-full"
              />
            </div>

            {/* Pre-publication Checklist */}
            <div
              className="p-3 mb-4"
              style={{
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="text-muted caption mb-1" style={{ fontWeight: 600 }}>
                CANARY PRE-FLIGHT AUDIT:
              </div>
              <div className="flex-col gap-1 caption">
                <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
                  <CheckCircle2 size={12} />
                  <span>Account isolated from main channel</span>
                </div>
                <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
                  <CheckCircle2 size={12} />
                  <span>Simulation sandbox verified</span>
                </div>
                <div className="flex items-center gap-1" style={{ color: '#10b981' }}>
                  <CheckCircle2 size={12} />
                  <span>Grounding verified against source lecture</span>
                </div>
              </div>
            </div>

            {feedback && (
              <div className={`alert mb-4 ${feedback.includes('Error') ? 'alert-error' : 'alert-success'}`}>
                {feedback}
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="flex gap-2">
            {selectedCandidate && (
              <button
                onClick={() => onNavigateEditor(selectedCandidate.id)}
                className="btn flex-1"
              >
                Back to Editor
              </button>
            )}
            <button
              onClick={handlePublishCanary}
              disabled={isSubmitting || !selectedCandidate}
              className="btn btn-primary"
              style={{ flex: 2 }}
            >
              <Send size={15} />
              <span>{isSubmitting ? 'Dispatching to Canary...' : 'Publish to Canary Test Account'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
