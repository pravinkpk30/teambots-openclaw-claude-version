// frontend/src/pages/ChatPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ChatBubble from '../components/ChatBubble';
import StatusBadge from '../components/StatusBadge';
import { getAgent, sendMessage, fireAgent } from '../services/api';

const CONV_ID = `conv_${Math.random().toString(36).slice(2)}`;

export default function ChatPage() {
  const { agentId } = useParams();
  const navigate     = useNavigate();

  const [agent,    setAgent]    = useState(null);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(true);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const pollRef    = useRef(null);

  // ── Load agent on mount ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadAgent() {
      try {
        const data = await getAgent(agentId);
        if (!cancelled) {
          setAgent(data);
          setLoading(false);
          if (data.status !== 'ready') {
            // Poll until ready (handles navigate-before-ready race)
            pollRef.current = setInterval(async () => {
              const updated = await getAgent(agentId).catch(() => null);
              if (updated && !cancelled) {
                setAgent(updated);
                if (updated.status === 'ready' || updated.status === 'error') {
                  clearInterval(pollRef.current);
                }
              }
            }, 2500);
          } else {
            // Add welcome message
            setMessages([{
              id: 'welcome',
              role: 'assistant',
              content: `Hello! I'm your ${data.role || 'AI Agent'}. How can I help you today?`,
            }]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Could not load agent. It may have been terminated.');
          setLoading(false);
        }
      }
    }

    loadAgent();
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, [agentId]);

  // Add welcome when agent becomes ready after polling
  useEffect(() => {
    if (agent?.status === 'ready' && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hello! I'm your ${agent.role || 'AI Agent'}. How can I help you today?`,
      }]);
    }
  }, [agent?.status]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || agent?.status !== 'ready') return;

    const userMsg = { id: Date.now(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError('');

    // Optimistic "thinking" placeholder
    const thinkId = `think_${Date.now()}`;
    setMessages(prev => [...prev, { id: thinkId, role: 'assistant', content: '…', thinking: true }]);

    try {
      const data = await sendMessage(agentId, text, CONV_ID);
      const content = data.message || data.response?.message || JSON.stringify(data);
      const artifacts = data.artifacts || [];

      setMessages(prev => prev
        .filter(m => m.id !== thinkId)
        .concat({ id: Date.now(), role: 'assistant', content, artifacts })
      );
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setMessages(prev => prev
        .filter(m => m.id !== thinkId)
        .concat({ id: Date.now(), role: 'assistant', content: '', error: errMsg })
      );
      setError(errMsg);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, agent, agentId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Fire (terminate) agent ─────────────────────────────────────────────────
  async function handleFire() {
    if (!window.confirm('Terminate this agent and destroy the KASM session?')) return;
    try {
      await fireAgent(agentId);
      navigate('/');
    } catch (err) {
      setError('Failed to terminate agent: ' + err.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text2)' }}>
        Loading agent…
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>← Back to Hire</button>
      </div>
    );
  }

  const isReady = agent?.status === 'ready';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => navigate('/')}>
          ← Hire
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {agent?.role || 'AI Agent'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {agentId} · {agent?.llmProvider} / {agent?.llmModel}
          </div>
        </div>
        <StatusBadge status={agent?.status || 'error'} />
        {isReady && (
          <button className="btn btn-danger" style={{ padding: '7px 14px', fontSize: 13 }} onClick={handleFire}>
            🔥 Fire
          </button>
        )}
      </header>

      {/* Not-ready banner */}
      {!isReady && (
        <div style={{
          textAlign: 'center', padding: '12px',
          background: '#1e3a5f', color: '#93c5fd', fontSize: 14,
          flexShrink: 0,
        }}>
          ⏳ Agent is still starting up ({agent?.status}). Chat will be enabled once it's ready…
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.length === 0 && isReady && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', marginTop: 80, fontSize: 15 }}>
            Start a conversation with your agent below.
          </div>
        )}
        {messages.map(msg => (
          <ChatBubble
            key={msg.id}
            msg={msg.thinking ? { ...msg, content: '💭 Thinking…' } : msg}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div style={{
          background: '#450a0a', color: '#f87171',
          padding: '10px 20px', fontSize: 13, flexShrink: 0,
        }}>
          ⚠️ {error}
          <button
            onClick={() => setError('')}
            style={{ marginLeft: 12, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
          >✕</button>
        </div>
      )}

      {/* Input bar */}
      <div style={{
        display: 'flex', gap: 10, padding: '14px 20px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          className="input"
          style={{ flex: 1, resize: 'none', height: 48, lineHeight: '28px' }}
          placeholder={isReady ? 'Type a message… (Enter to send, Shift+Enter for newline)' : 'Waiting for agent to be ready…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isReady || sending}
          rows={1}
        />
        <button
          className="btn btn-primary"
          style={{ height: 48, padding: '0 22px' }}
          onClick={handleSend}
          disabled={!isReady || sending || !input.trim()}
        >
          {sending ? '⏳' : '➤'}
        </button>
      </div>

    </div>
  );
}
