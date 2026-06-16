// frontend/src/components/ArtifactCard.jsx
import React, { useState, useEffect } from 'react';

const TYPE_ICON = {
  html: '🌐',
  pdf: '📄',
  json: '{ }',
  csv: '📊',
  markdown: '📝',
  md: '📝',
  text: '📋',
};

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArtifactCard({ artifact }) {
  const [previewOpen, setPreviewOpen] = useState(
    artifact.previewable && artifact.type === 'html'
  );
  const [previewHtml, setPreviewHtml] = useState(artifact.inlineContent || '');

  useEffect(() => {
    if (artifact.inlineContent) {
      setPreviewHtml(artifact.inlineContent);
      return;
    }
    if (!artifact.previewable || !artifact.url) return;

    // Fallback: fetch from backend (port 4000) — never use frontend :3000 for HTML preview
    let cancelled = false;
    fetch(artifact.url)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('fetch failed'))))
      .then(html => { if (!cancelled) setPreviewHtml(html); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [artifact.inlineContent, artifact.url, artifact.previewable]);

  const icon = TYPE_ICON[artifact.type] || '📎';
  const sizeLabel = formatSize(artifact.size);

  function copyLink(url) {
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  return (
    <div
      style={{
        marginTop: 10,
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderBottom: previewOpen ? '1px solid var(--border)' : 'none',
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{artifact.title || artifact.filename}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            {artifact.filename}
            {sizeLabel ? ` · ${sizeLabel}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {artifact.previewable && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => setPreviewOpen(v => !v)}
            >
              {previewOpen ? 'Hide' : 'Preview'}
            </button>
          )}
          {artifact.url && (
            <a
              href={artifact.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
            >
              Open ↗
            </a>
          )}
          {artifact.downloadUrl && (
            <a
              href={artifact.downloadUrl}
              download={artifact.filename}
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
            >
              Download
            </a>
          )}
          {artifact.pdfDownloadUrl && (
            <a
              href={artifact.pdfDownloadUrl}
              download={artifact.pdfFilename}
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
            >
              PDF ↓
            </a>
          )}
          {artifact.url && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => copyLink(artifact.url)}
              title="Copy link to clipboard"
            >
              Copy link
            </button>
          )}
        </div>
      </div>

      {previewOpen && artifact.previewable && previewHtml && (
        <iframe
          title={artifact.title || artifact.filename}
          srcDoc={previewHtml}
          sandbox="allow-scripts"
          style={{
            width: '100%',
            height: 360,
            border: 'none',
            background: '#fff',
            display: 'block',
          }}
        />
      )}
    </div>
  );
}
