// frontend/src/components/ChatBubble.jsx
import React from 'react';

export default function ChatBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--accent)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 14, marginRight: 8, flexShrink: 0,
        }}>🤖</div>
      )}
      <div
        style={{
          maxWidth: '72%',
          padding: '10px 16px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? 'var(--accent)' : 'var(--surface2)',
          color: 'var(--text)',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {msg.content}
        {msg.error && (
          <div style={{ color: 'var(--danger)', marginTop: 4, fontSize: 12 }}>
            ⚠️ {msg.error}
          </div>
        )}
      </div>
      {isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--surface2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 14, marginLeft: 8, flexShrink: 0,
        }}>👤</div>
      )}
    </div>
  );
}
