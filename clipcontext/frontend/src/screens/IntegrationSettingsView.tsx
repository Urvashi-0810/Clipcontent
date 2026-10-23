import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Users,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { IntegrationProviderStatus } from '../types';
import { api } from '../services/api';

interface IntegrationSettingsViewProps {
  onNavigateDocs: () => void;
}

export const IntegrationSettingsView: React.FC<IntegrationSettingsViewProps> = ({
  onNavigateDocs,
}) => {
  const [integrations, setIntegrations] = useState<IntegrationProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await api.getIntegrations();
        setIntegrations(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <span className="badge badge-green text-xs">CONNECTED (CORE ENGINE)</span>;
      case 'awaiting_implementation':
        return <span className="badge badge-amber text-xs">AWAITING IMPLEMENTATION (MOCK ACTIVE)</span>;
      case 'ready_for_integration':
        return <span className="badge badge-blue text-xs">READY FOR INTEGRATION</span>;
      default:
        return <span className="badge badge-neutral text-xs">{status.toUpperCase()}</span>;
    }
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header mb-5">
        <div className="page-header-text">
          <div className="flex items-center gap-2 mb-1">
            <span className="badge badge-blue">TEAM ARCHITECTURE BOUNDARY</span>
            <span className="caption text-muted">
              Deliberate Phase 1 Scope Isolation
            </span>
          </div>
          <h1 className="heading-2">Integrations & AI Service Contracts</h1>
          <p className="text-secondary">
            Transparent status of all 8 core providers. AI/LLM/RAG/Speech capabilities are isolated behind typed interfaces for teammate handoff.
          </p>
        </div>

        <div className="page-header-actions">
          <button onClick={onNavigateDocs} className="btn btn-primary">
            <BookOpen size={15} />
            <span>Open AI Handoff Spec</span>
          </button>
        </div>
      </div>

      {/* Honest Boundary Notice */}
      <div className="alert alert-warning mb-6 flex items-center gap-4">
        <AlertTriangle size={24} color="#f59e0b" className="shrink-0" />
        <div className="text-sm text-secondary leading-relaxed">
          <strong className="text-primary">Honest State Verification: </strong>
          No AI outputs are fabricated. Providers marked with <strong>AWAITING IMPLEMENTATION</strong> use deterministic demo fixtures so creators can build and test workflows immediately without unconfigured API keys.
        </div>
      </div>

      {/* Providers Grid */}
      <div className="grid grid-auto gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {integrations.map((provider) => (
          <div
            key={provider.id}
            className="card p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex-between items-start mb-2">
                <div>
                  <span className="badge badge-purple text-xs">
                    {provider.category}
                  </span>
                  <h3 className="heading-3 mt-1">
                    {provider.name}
                  </h3>
                </div>
                {getStatusBadge(provider.status)}
              </div>

              <p className="text-secondary text-sm mb-4 leading-relaxed">
                {provider.description}
              </p>

              {/* Contracts Details */}
              <div className="bg-surface rounded p-3 text-xs mb-3">
                <div className="text-muted mb-1">
                  INPUTS REQUIRED:
                </div>
                <div className="text-primary mb-2">
                  {provider.inputs_required.join(', ')}
                </div>

                <div className="text-muted mb-1">
                  OUTPUTS EXPECTED:
                </div>
                <div className="text-primary">
                  {provider.outputs_expected.join(', ')}
                </div>
              </div>
            </div>

            {/* Teammate & Notes Footer */}
            <div className="border-t border-glass pt-3 text-xs">
              <div className="flex items-center gap-2 text-muted mb-1">
                <Users size={12} />
                <span>Assigned: <strong className="text-primary">{provider.assigned_teammate}</strong></span>
              </div>
              <div className="text-secondary">
                {provider.implementation_notes}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
