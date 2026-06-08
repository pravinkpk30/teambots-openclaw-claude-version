// frontend/src/components/StatusBadge.jsx
import React from 'react';

const labels = {
  provisioning:      '⏳ Provisioning',
  kasm_provisioning: '⏳ Creating session',
  kasm_running:      '🔄 Starting bridge…',
  ready:             '✅ Ready',
  error:             '❌ Error',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      {labels[status] || status}
    </span>
  );
}
