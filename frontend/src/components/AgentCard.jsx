// frontend/src/components/AgentCard.jsx
import React from 'react';

export default function AgentCard({ profile, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `2px solid ${selected ? profile.color : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '18px',
        background: selected ? `${profile.color}15` : 'var(--surface)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>{profile.emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{profile.role}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
        {profile.description}
      </div>
      {profile.skills && (
        <div style={{ marginTop: 8, fontSize: 11, color: profile.color, fontWeight: 600 }}>
          🔧 {profile.skills}
        </div>
      )}
    </div>
  );
}
