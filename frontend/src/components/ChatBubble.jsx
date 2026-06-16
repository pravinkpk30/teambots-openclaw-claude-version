// frontend/src/components/ChatBubble.jsx
import React from 'react';
import ArtifactCard from './ArtifactCard';

export default function ChatBubble({ msg }) {
  const isUser = msg.role === 'user';
  const hasArtifacts = !isUser && Array.isArray(msg.artifacts) && msg.artifacts.length > 0;

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
          maxWidth: hasArtifacts ? '88%' : '72%',
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
        {hasArtifacts && msg.artifacts.map((artifact) => (
          <ArtifactCard key={artifact.filename} artifact={artifact} />
        ))}
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
