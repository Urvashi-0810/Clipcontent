import React, { useEffect, useState } from 'react';
import {
  SplitSquareVertical,
  Scissors,
  Send,
  Sparkles,
  TrendingUp,
  Clock,
  Layers,
  ArrowRight
} from 'lucide-react';
import { ClipCandidate, Project } from '../types';
import { api } from '../services/api';

interface VariantComparisonViewProps {
  currentProject: Project | null;
  onOpenEditor: (candidateId: string) => void;
  onOpenTestStudio: (candidateId: string) => void;
}

export const VariantComparisonView: React.FC<VariantComparisonViewProps> = ({
  currentProject,
  onOpenEditor,
  onOpenTestStudio,
}) => {
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const cands = await api.getCandidates({ projectId: currentProject?.id });
        setCandidates(cands);
        if (cands.length >= 2) {
          setSelectedIds([cands[0].id, cands[1].id]);
        } else if (cands.length === 1) {
          setSelectedIds([cands[0].id]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentProject?.id]);

  const selectedCandidates = candidates.filter((c) => selectedIds.includes(c.id));

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length > 1) {
        setSelectedIds(selectedIds.filter((x) => x !== id));
      }
    } else {
      if (selectedIds.length < 3) {
        setSelectedIds([...selectedIds, id]);
      } else {
        setSelectedIds([selectedIds[1], selectedIds[2], id]);
      }
    }
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5">
        <div className="page-header-text">
          <h1 className="heading-2">Variant Comparison Matrix</h1>
          <p className="caption text-secondary">
            A/B & Multi-Variant evaluation: Compare psychological hook angles, pacing, and viral potential side-by-side.
          </p>
        </div>
      </div>

      {/* Variant Selector Pills */}
      <div className="card p-4 mb-6 flex align-center gap-3" style={{ flexWrap: 'wrap' }}>
        <span className="caption text-muted" style={{ fontWeight: 600 }}>
          SELECT UP TO 3 VARIANTS TO COMPARE:
        </span>
        {candidates.map((c) => {
          const isSelected = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggleSelect(c.id)}
              className={`btn ${isSelected ? 'btn-primary' : ''}`}
              style={{ fontSize: '12px', padding: '5px 10px' }}
            >
              <span>{c.variant_name}</span>
              <span style={{ opacity: 0.6 }}>({c.ranking_score})</span>
            </button>
          );
        })}
      </div>

      {/* Side-by-Side Comparison Columns */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: `repeat(${selectedCandidates.length || 1}, 1fr)` }}
      >
        {selectedCandidates.map((cand) => (
          <div
            key={cand.id}
            className="card p-5 flex flex-col flex-between"
          >
            <div>
              {/* Header Badge */}
              <div className="flex flex-between align-center mb-3">
                <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                  {cand.hook_strategy.replace('_', ' ').toUpperCase()}
                </span>
                <span className="badge badge-blue" style={{ fontSize: '11px' }}>
                  Score: {cand.ranking_score}
                </span>
              </div>

              {/* Mock Viewport */}
              <div
                className="flex align-center text-center p-4 mb-4"
                style={{
                  height: '240px',
                  background: 'linear-gradient(135deg, #0b0f17 0%, #1e1b4b 100%)',
                  borderRadius: 'var(--radius-sm)',
                  justifyContent: 'center',
                  border: '1px solid var(--border)',
                  position: 'relative',
                }}
              >
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFEA00', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                    "{cand.title}"
                  </div>
                  <div className="caption text-muted mt-2">
                    {cand.aspect_ratio} • {Math.round(cand.end_time - cand.start_time)}s duration
                  </div>
                </div>
              </div>

              {/* Attributes Table */}
              <div className="flex flex-col gap-2 mb-4" style={{ fontSize: '12px' }}>
                <div className="card p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <div className="caption text-muted mb-1" style={{ fontSize: '10px' }}>PSYCHOLOGICAL RATIONALE</div>
                  <div>{cand.hook_rationale || 'Focused hook strategy trigger.'}</div>
                </div>

                <div className="card p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <div className="caption text-muted mb-1" style={{ fontSize: '10px' }}>DISCRIMINATOR RANKING RATIONALE</div>
                  <div>{cand.ranking_rationale || 'Niche benchmark scoring.'}</div>
                </div>

                <div className="card p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <div className="caption text-muted mb-1" style={{ fontSize: '10px' }}>GROUNDED TIMECODE</div>
                  <div>{cand.grounding_source_timecode}</div>
                </div>

                <div className="card p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <div className="caption text-muted mb-1" style={{ fontSize: '10px' }}>HASHTAG STRATEGY</div>
                  <div style={{ color: 'var(--blue)' }}>{cand.hashtags?.join(' ')}</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-3 divider-top">
              <button
                onClick={() => onOpenEditor(cand.id)}
                className="btn flex-1"
                style={{ fontSize: '12px' }}
              >
                <Scissors size={14} />
                <span>Open in Editor</span>
              </button>
              <button
                onClick={() => onOpenTestStudio(cand.id)}
                className="btn btn-primary flex-1"
                style={{ fontSize: '12px' }}
              >
                <Send size={14} />
                <span>Publish Test</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
