// frontend/src/pages/HirePage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentCard from '../components/AgentCard';
import StatusBadge from '../components/StatusBadge';
import profiles, {
  LLM_PROVIDERS,
  findProvider,
  getDefaultModelId,
  getModelId,
  getModelLabel,
} from '../services/agentProfiles';
import { hireAgent, getAgent } from '../services/api';

const POLL_INTERVAL_MS = 3000;
const READY_TIMEOUT_MS = 300_000; // 5 min

export default function HirePage() {
  const navigate = useNavigate();

  const [selectedProfile, setSelectedProfile] = useState(profiles[0]);
  const [provider, setProvider]               = useState(LLM_PROVIDERS[0]);
  const [model, setModel]                     = useState(getDefaultModelId(LLM_PROVIDERS[0].id));
  const [apiKey, setApiKey]                   = useState('');
  const [sponsor, setSponsor]                 = useState('');
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [hiringStatus, setHiringStatus]       = useState(null); // { agentId, status, message }

  const pollRef    = useRef(null);
  const timeoutRef = useRef(null);

  // When provider changes, reset model to first of that provider
  useEffect(() => {
    setModel(getDefaultModelId(provider.id));
  }, [provider]);

  // Clear polling on unmount
  useEffect(() => () => {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
  }, []);

  async function handleHire(e) {
    e.preventDefault();
    setError('');
    if (!apiKey.trim()) return setError('Please enter your LLM API key.');

    setLoading(true);
    setHiringStatus(null);

    try {
      const data = await hireAgent({
        role:         selectedProfile.role,
        job_title:    selectedProfile.jobTitle,
        sponsor:      sponsor || 'User',
        llm_provider: provider.id,
        llm_model:    model,
        llm_api_key:  apiKey.trim(),
        skills:       selectedProfile.skills,
        enable_web_search: selectedProfile.enableWebSearch !== false,
        user_id:      'demo_user',
      });

      setHiringStatus({
        agentId: data.agent_id,
        status: data.status,
        message: data.message,
        kasmUrl: data.kasm_url || null,
      });
      startPolling(data.agent_id);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function startPolling(agentId) {
    // Timeout safety net
    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      setHiringStatus(prev => prev ? { ...prev, status: 'error', message: 'Timed out waiting for agent to become ready.' } : prev);
    }, READY_TIMEOUT_MS);

    pollRef.current = setInterval(async () => {
      try {
        const agent = await getAgent(agentId);
        setHiringStatus(prev => ({
          agentId,
          status: agent.status,
          message: statusMessage(agent.status),
          // Keep the link once we have it (hire response or earlier poll)
          kasmUrl: agent.kasmUrl || prev?.kasmUrl || null,
        }));

        if (agent.status === 'ready') {
          clearInterval(pollRef.current);
          clearTimeout(timeoutRef.current);
          // Brief pause so user sees the "ready" state, then navigate to chat
          setTimeout(() => navigate(`/chat/${agentId}`), 800);
        } else if (agent.status === 'error') {
          clearInterval(pollRef.current);
          clearTimeout(timeoutRef.current);
          setError(agent.errorMessage || 'Agent encountered an error during startup.');
        }
      } catch (err) {
        // Non-fatal poll errors — keep polling
        console.warn('[TeamBots] poll error:', err.message);
      }
    }, POLL_INTERVAL_MS);
  }

  function statusMessage(status) {
    const map = {
      provisioning:      'Creating KASM user…',
      kasm_provisioning: 'Provisioning container…',
      kasm_running:      'Container running — waiting for OpenClaw gateway + bridge to start…',
      ready:             'Agent is ready! Opening chat…',
      error:             'Agent failed to start.',
    };
    return map[status] || status;
  }

  const providerObj = findProvider(provider.id);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🦞</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>TeamBots</h1>
          <p style={{ color: 'var(--text2)', fontSize: 16 }}>
            Hire an AI agent powered by OpenClaw — running in your KASM workspace
          </p>
        </div>

        <form onSubmit={handleHire}>

          {/* Agent selection */}
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              1. Choose an agent
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
            }}>
              {profiles.map(p => (
                <AgentCard
                  key={p.id}
                  profile={p}
                  selected={selectedProfile.id === p.id}
                  onClick={() => setSelectedProfile(p)}
                />
              ))}
            </div>
          </section>

          {/* LLM config */}
          <section style={{
            marginBottom: 36,
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            padding: 24,
            border: '1px solid var(--border)',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
              2. Configure LLM
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Provider */}
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                  Provider
                </label>
                <select
                  className="select"
                  value={provider.id}
                  onChange={e => setProvider(findProvider(e.target.value))}
                >
                  {LLM_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                  Model
                </label>
                <select
                  className="select"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                >
                  {providerObj.models.map(m => (
                    <option key={getModelId(m)} value={getModelId(m)}>
                      {getModelLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* API Key */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                API Key <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="password"
                className="input"
                placeholder={providerObj.apiKeyPlaceholder || `Your ${providerObj.label} API key`}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                required
                autoComplete="off"
              />
              <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                Stored only for this session, injected into the container environment.
                {providerObj.apiKeyHelpUrl && (
                  <>
                    {' '}
                    <a
                      href={providerObj.apiKeyHelpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)' }}
                    >
                      Get API key ↗
                    </a>
                  </>
                )}
              </p>
            </div>

            {/* Sponsor / Your name */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>
                Your name (optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Jordan Lee"
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
              />
            </div>
          </section>

          {/* Error */}
          {error && (
            <div style={{
              background: '#450a0a', color: '#f87171',
              borderRadius: 8, padding: '12px 16px',
              marginBottom: 16, fontSize: 14,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Hire status */}
          {hiringStatus && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px', marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <StatusBadge status={hiringStatus.status} />
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                  {hiringStatus.agentId}
                </span>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text)' }}>{hiringStatus.message}</p>

              {hiringStatus.kasmUrl && (
                <a
                  href={hiringStatus.kasmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    marginTop: 12, padding: '8px 16px', fontSize: 13,
                    border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text)', textDecoration: 'none',
                  }}
                >
                  🖥️ Open KASM session
                </a>
              )}
            </div>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || (hiringStatus && hiringStatus.status !== 'error')}
              style={{ padding: '14px 40px', fontSize: 16 }}
            >
              {loading ? '⏳ Hiring…' : `Hire ${selectedProfile.emoji} ${selectedProfile.role}`}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
