/**
 * services/artifactUrls.js
 * Build public artifact URLs for the frontend / browser.
 */

'use strict';

function getBackendBase(_req) {
  // Always point artifact links at the backend (port 4000), NOT the React dev
  // server (port 3000). CRA dev-server returns index.html for iframe navigations
  // to /api/* with Accept: text/html, which shows the Hire page instead of artifacts.
  if (process.env.PUBLIC_BACKEND_URL) {
    return process.env.PUBLIC_BACKEND_URL.replace(/\/$/, '');
  }
  const port = process.env.PORT || 4000;
  return `http://localhost:${port}`;
}

function artifactPath(agentId, filename, { download = false } = {}) {
  const base = `/api/agents/${encodeURIComponent(agentId)}/artifacts/${encodeURIComponent(filename)}`;
  return download ? `${base}?download=1` : base;
}

function enrichArtifacts(agentId, artifacts, req) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return [];

  const backendBase = getBackendBase(req);

  return artifacts.map((a) => {
    const viewPath = artifactPath(agentId, a.filename);
    const downloadPath = artifactPath(agentId, a.filename, { download: true });
    const enriched = {
      ...a,
      url: `${backendBase}${viewPath}`,
      downloadUrl: `${backendBase}${downloadPath}`,
    };
    if (a.pdfFilename) {
      enriched.pdfUrl = `${backendBase}${artifactPath(agentId, a.pdfFilename)}`;
      enriched.pdfDownloadUrl = `${backendBase}${artifactPath(agentId, a.pdfFilename, { download: true })}`;
    }
    return enriched;
  });
}

module.exports = { enrichArtifacts, getBackendBase, artifactPath };
