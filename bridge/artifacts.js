/**
 * bridge/artifacts.js
 *
 * Parses LLM responses for TeamBots artifact protocol, persists files,
 * and optionally generates PDF companions for HTML deliverables.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { tryGeneratePdfFromHtml } = require('./pdfGenerator');

const ARTIFACT_MARKER_RE = /<!--\s*teambots-artifact\s*([\s\S]*?)\s*-->/gi;
const HTML_FENCE_RE = /```html\s*\n([\s\S]*?)```/gi;
const GENERIC_FENCE_RE = /```(\w+)?\s*\n([\s\S]*?)```/g;

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.pdf':  'application/pdf',
  '.json': 'application/json; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
};

const EXT_BY_TYPE = {
  html: '.html',
  pdf:  '.pdf',
  json: '.json',
  csv:  '.csv',
  markdown: '.md',
  md: '.md',
  text: '.txt',
};

function getArtifactsDir() {
  const home = process.env.HOME || '/root';
  return process.env.TEAMBOTS_ARTIFACTS_DIR || path.join(home, '.teambots', 'artifacts');
}

function ensureArtifactsDir() {
  const dir = getArtifactsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeFilename(name, fallbackExt = '.html') {
  let base = String(name || 'artifact').trim();
  if (!base) base = 'artifact';
  base = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  if (base.length > 120) base = base.slice(0, 120);
  if (!path.extname(base) && fallbackExt) base += fallbackExt;
  return base;
}

function uniqueFilename(dir, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = filename;
  let n = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}-${n}${ext}`;
    n += 1;
  }
  return candidate;
}

function mimeForFilename(filename) {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

function slugify(text) {
  return String(text || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'artifact';
}

function defaultFilename(type, title, conversationId) {
  const ext = EXT_BY_TYPE[type] || '.bin';
  const prefix = conversationId ? slugify(conversationId).slice(0, 12) : crypto.randomBytes(4).toString('hex');
  const titlePart = slugify(title);
  return safeFilename(`${prefix}-${titlePart}${ext}`, ext);
}

function decodeContent(spec) {
  if (spec.content != null) return String(spec.content);
  if (spec.content_base64) {
    return Buffer.from(String(spec.content_base64), 'base64');
  }
  return null;
}

function readWorkspaceFile(relPath) {
  const home = process.env.HOME || '/root';
  const workspace = path.join(home, '.openclaw', 'workspace');
  const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(workspace, normalized);
  if (!full.startsWith(workspace)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return fs.readFileSync(full);
}

async function persistArtifactSpec(spec, conversationId, agentRole, log) {
  const dir = ensureArtifactsDir();
  const type = String(spec.type || 'html').toLowerCase();
  const title = spec.title || spec.name || path.basename(spec.filename || 'Deliverable', path.extname(spec.filename || ''));
  let filename = spec.filename ? safeFilename(spec.filename) : defaultFilename(type, title, conversationId);
  filename = uniqueFilename(dir, filename);

  let body = decodeContent(spec);
  if (body == null && spec.path) {
    body = readWorkspaceFile(spec.path);
  }
  if (body == null) {
    log('WARN', 'artifact spec missing content', { type, filename: spec.filename });
    return null;
  }

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, body);

  const artifact = {
    type,
    title,
    filename,
    mimeType: mimeForFilename(filename),
    size: fs.statSync(filePath).size,
    previewable: type === 'html' || filename.endsWith('.html'),
  };

  if (artifact.previewable) {
    const html = String(body);
    // Inline HTML for iframe srcDoc preview (avoids CRA dev-server SPA fallback on :3000)
    artifact.inlineContent = html.length <= 512_000 ? html : html.slice(0, 512_000);
  }

  const wantsPdf = spec.generatePdf === true || shouldAutoGeneratePdf(agentRole, type);
  if (wantsPdf && (type === 'html' || filename.endsWith('.html'))) {
    const pdfName = uniqueFilename(dir, filename.replace(/\.html?$/i, '.pdf'));
    const pdfPath = path.join(dir, pdfName);
    const ok = await tryGeneratePdfFromHtml(String(body), pdfPath, log);
    if (ok) {
      artifact.pdfFilename = pdfName;
      artifact.pdfMimeType = 'application/pdf';
    }
  }

  return artifact;
}

function shouldAutoGeneratePdf(agentRole, type) {
  if (type !== 'html') return false;
  const role = String(agentRole || '').toLowerCase();
  return role.includes('invoice') || role.includes('billing');
}

function parseMarkerSpecs(content) {
  const specs = [];
  let match;
  const re = new RegExp(ARTIFACT_MARKER_RE.source, 'gi');
  while ((match = re.exec(content)) !== null) {
    try {
      specs.push(JSON.parse(match[1].trim()));
    } catch {
      // ignore malformed marker
    }
  }
  return specs;
}

function extractHtmlFences(content) {
  const blocks = [];
  let match;
  const re = new RegExp(HTML_FENCE_RE.source, 'gi');
  while ((match = re.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function extractTypedFences(content) {
  const results = [];
  let match;
  const re = new RegExp(GENERIC_FENCE_RE.source, 'g');
  while ((match = re.exec(content)) !== null) {
    const lang = (match[1] || '').toLowerCase();
    const body = match[2].trim();
    if (!body || lang === 'html') continue;
    if (['json', 'csv', 'markdown', 'md', 'text', 'txt'].includes(lang)) {
      results.push({ type: lang === 'txt' ? 'text' : lang, content: body });
    }
  }
  return results;
}

function cleanMessageForDisplay(content, artifacts) {
  let text = content;

  text = text.replace(ARTIFACT_MARKER_RE, '').trim();

  if (artifacts.length > 0) {
    text = text.replace(HTML_FENCE_RE, '').trim();
    // Remove other fenced blocks that became artifacts
    text = text.replace(GENERIC_FENCE_RE, (full, lang) => {
      const l = (lang || '').toLowerCase();
      if (['json', 'csv', 'markdown', 'md', 'text', 'txt'].includes(l)) return '';
      return full;
    }).trim();
  }

  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  if (!text && artifacts.length > 0) {
    const titles = artifacts.map(a => a.title).join(', ');
    text = `I've prepared your deliverable${artifacts.length > 1 ? 's' : ''}: ${titles}.`;
  }

  return text;
}

/**
 * Process raw LLM content → saved artifacts + cleaned chat message.
 */
async function processResponseArtifacts(rawContent, { conversationId, agentRole, log = () => {} }) {
  const artifacts = [];
  const seen = new Set();
  const htmlBlocks = extractHtmlFences(rawContent);
  let htmlBlockIdx = 0;

  async function add(spec) {
    let resolved = { ...spec };
    if (resolved.content == null && resolved.content_base64 == null && !resolved.path) {
      const type = String(resolved.type || 'html').toLowerCase();
      if (type === 'html' && htmlBlocks[htmlBlockIdx]) {
        resolved.content = htmlBlocks[htmlBlockIdx];
        htmlBlockIdx += 1;
      }
    }
    const saved = await persistArtifactSpec(resolved, conversationId, agentRole, log);
    if (saved && !seen.has(saved.filename)) {
      seen.add(saved.filename);
      artifacts.push(saved);
    }
  }

  // 1. Structured protocol markers (preferred)
  for (const spec of parseMarkerSpecs(rawContent)) {
    await add(spec);
  }

  const hasHtmlArtifact = artifacts.some(a => a.type === 'html' || a.filename?.endsWith('.html'));

  // 2. Remaining HTML fences when markers did not produce html
  if (!hasHtmlArtifact && htmlBlocks.length > htmlBlockIdx) {
    for (let i = htmlBlockIdx; i < htmlBlocks.length; i += 1) {
      await add({
        type: 'html',
        title: htmlBlocks.length > 1 ? `Web output ${i + 1}` : 'Web output',
        content: htmlBlocks[i],
        generatePdf: shouldAutoGeneratePdf(agentRole, 'html'),
      });
    }
  }

  // 3. Other typed fences when nothing saved yet
  if (artifacts.length === 0) {
    for (const block of extractTypedFences(rawContent)) {
      await add({
        type: block.type,
        title: `${block.type.toUpperCase()} output`,
        content: block.content,
      });
    }
  }

  const message = cleanMessageForDisplay(rawContent, artifacts);
  return { message, artifacts };
}

function resolveArtifactPath(filename) {
  const safe = safeFilename(filename, '');
  if (!safe || safe !== filename.replace(/[^a-zA-Z0-9._-]/g, '_')) {
    // Reject path traversal — filename must be basename only
    const base = path.basename(filename);
    if (base !== filename || base.includes('..')) return null;
  }
  const base = path.basename(filename);
  const filePath = path.join(getArtifactsDir(), base);
  const dir = getArtifactsDir();
  if (!filePath.startsWith(dir)) return null;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return filePath;
}

module.exports = {
  getArtifactsDir,
  ensureArtifactsDir,
  processResponseArtifacts,
  resolveArtifactPath,
  mimeForFilename,
};
