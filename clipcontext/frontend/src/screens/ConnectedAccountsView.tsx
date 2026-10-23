import React, { useEffect, useState } from 'react';
import {
  Users2,
  Plus,
  Shield,
  Trash2,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Smartphone,
  AlertCircle
} from 'lucide-react';
import { ConnectedAccount } from '../types';
import { api } from '../services/api';

export const ConnectedAccountsView: React.FC = () => {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [accountType, setAccountType] = useState<'canary_test' | 'main_channel'>('canary_test');
  const [platform, setPlatform] = useState<'youtube_shorts' | 'tiktok' | 'instagram_reels'>('youtube_shorts');
  const [handle, setHandle] = useState('@');
  const [displayName, setDisplayName] = useState('');
  const [isSim, setIsSim] = useState(true);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleToggleActive = async (account: ConnectedAccount) => {
    try {
      await api.updateAccount(account.id, { is_active: !account.is_active });
      await loadAccounts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSimulation = async (account: ConnectedAccount) => {
    try {
      await api.updateAccount(account.id, { is_simulation_mode: !account.is_simulation_mode });
      await loadAccounts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAccount({
        account_type: accountType,
        platform,
        account_handle: handle,
        display_name: displayName,
        is_simulation_mode: isSim,
      });
      setShowAddModal(false);
      setHandle('@');
      setDisplayName('');
      await loadAccounts();
    } catch (err) {
      console.error(err);
    }
  };

  const canaryAccounts = accounts.filter((a) => a.account_type === 'canary_test');
  const mainAccounts = accounts.filter((a) => a.account_type === 'main_channel');

  return (
    <div className="view-container">
      {/* Header */}
      <div className="page-header flex-between mb-5">
        <div className="page-header-text">
          <h1 className="heading-2">Connected Social Accounts</h1>
          <p className="text-secondary body">
            Strict channel isolation: Separate secondary/canary test accounts from main creator distribution channels.
          </p>
        </div>

        <div className="page-header-actions">
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <Plus size={16} />
            <span>Connect New Account</span>
          </button>
        </div>
      </div>

      {/* Canary Test Accounts Section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="badge badge-amber">CANARY TESTING ACCOUNTS</span>
          <span className="text-muted caption">
            Isolated secondary sandbox channels used for multi-variant testing
          </span>
        </div>

        <div className="grid grid-auto">
          {canaryAccounts.map((acc) => (
            <div key={acc.id} className="card p-4">
              <div className="flex flex-between mb-3">
                <div>
                  <div className="heading-3">{acc.display_name}</div>
                  <div className="text-muted caption">
                    {acc.account_handle} • {acc.platform.replace('_', ' ').toUpperCase()}
                  </div>
                </div>
                <span className={`badge ${acc.is_active ? 'badge-green' : 'badge-neutral'}`}>
                  {acc.is_active ? 'CONNECTED' : 'PAUSED'}
                </span>
              </div>

              <div
                className="flex flex-between mb-3 p-2"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(0,0,0,0.2)'
                }}
              >
                <span className="caption">Simulation Sandbox Mode</span>
                <button
                  onClick={() => handleToggleSimulation(acc)}
                  className={`badge ${acc.is_simulation_mode ? 'badge-green' : 'badge-amber'}`}
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  {acc.is_simulation_mode ? 'ACTIVE' : 'LIVE API'}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleActive(acc)}
                  className="btn flex-1 btn-sm"
                >
                  {acc.is_active ? 'Pause Sync' : 'Resume Sync'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Creator Channels Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="badge badge-blue">OFFICIAL MAIN CHANNELS</span>
          <span className="text-muted caption">
            High-reach creator channels protected by explicit promotion approval gates
          </span>
        </div>

        <div className="grid grid-auto">
          {mainAccounts.map((acc) => (
            <div
              key={acc.id}
              className="card p-4"
              style={{
                border: '1px solid rgba(59, 130, 246, 0.3)',
                background: 'rgba(59, 130, 246, 0.05)',
              }}
            >
              <div className="flex flex-between mb-3">
                <div>
                  <div className="heading-3">{acc.display_name}</div>
                  <div className="text-muted caption">
                    {acc.account_handle} • {acc.platform.replace('_', ' ').toUpperCase()} • {acc.subscribers_count?.toLocaleString()} subs
                  </div>
                </div>
                <span className="badge badge-green">PROTECTED</span>
              </div>

              <div className="text-secondary caption mb-3">
                🛡️ Direct automated publishing is disabled. Requires explicit creator acknowledgement before dispatch.
              </div>

              <button
                onClick={() => handleToggleActive(acc)}
                className="btn w-full btn-sm"
              >
                {acc.is_active ? 'Channel Active & Protected' : 'Channel Disconnected'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Connect New Account */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal card p-6" style={{ width: '460px' }}>
            <h2 className="heading-2 mb-3">
              Connect Social Account
            </h2>

            <form onSubmit={handleCreate}>
              <div className="form-group mb-3">
                <label className="form-label">
                  Account Tier / Purpose *
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('canary_test')}
                    className={`btn flex-1 ${accountType === 'canary_test' ? 'btn-primary' : ''}`}
                  >
                    Canary Test Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('main_channel')}
                    className={`btn flex-1 ${accountType === 'main_channel' ? 'btn-primary' : ''}`}
                  >
                    Main Channel
                  </button>
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as any)}
                  className="select w-full"
                >
                  <option value="youtube_shorts">YouTube Shorts</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram_reels">Instagram Reels</option>
                </select>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Canary Lab Alpha"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div className="form-group mb-4">
                <label className="form-label">
                  Handle / Username *
                </label>
                <input
                  type="text"
                  required
                  placeholder="@handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div className="flex justify-end gap-2 text-right">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
