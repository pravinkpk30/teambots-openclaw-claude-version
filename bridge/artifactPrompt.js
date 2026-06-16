/**
 * bridge/artifactPrompt.js
 * Role-specific instructions for the TeamBots artifact protocol.
 */

'use strict';

const ARTIFACT_PROTOCOL = `
## TeamBots deliverable protocol

When the user asks for a web page, dashboard, report, invoice, document, or any visual/file output:

1. Write a short summary in plain text (1–3 sentences).
2. Include the deliverable using the structured artifact marker (preferred):

<!-- teambots-artifact
{
  "type": "html",
  "title": "Human-readable title",
  "filename": "descriptive-name.html",
  "content": "<!DOCTYPE html>...complete self-contained HTML..."
}
-->

Supported types: html, pdf, json, csv, markdown, text.
- For html: use a complete self-contained document with inline CSS.
- You may put HTML in a \`\`\`html fence and reference it from the marker without "content" (metadata-only marker).
- For pdf: set "type": "pdf" and either "content_base64" (base64-encoded PDF bytes) or "generatePdf": true on an html artifact.
- For json/csv: set type accordingly and put raw content in "content".
- Optional: "generatePdf": true on html artifacts to also produce a PDF download (recommended for invoices).

Rules:
- Do NOT dump large HTML/CSS in plain chat outside the artifact marker.
- Always use the artifact marker for pages, dashboards, invoices, and reports.
- Filenames: lowercase, hyphens, include extension (e.g. login-page.html, invoice-inv-001.html).
`.trim();

const ROLE_HINTS = {
  'Invoice Agent': `
For invoices and billing documents:
- Produce a polished HTML invoice with vendor/client details, line items, tax, and totals.
- Set "generatePdf": true on the html artifact.
- Filename pattern: invoice-{number}.html
`.trim(),

  'Marketing Researcher': `
For market research deliverables:
- Prefer HTML dashboards or structured markdown reports as artifacts.
- Include charts/tables in HTML when summarizing KPIs or trends.
`.trim(),

  'Competitive Intelligence Analyst': `
For competitive intelligence:
- Deliver HTML summary dashboards or markdown briefs as artifacts.
`.trim(),

  'Content Brief Writer': `
For content briefs:
- Deliver markdown (.md) or HTML artifacts with outline, audience, tone, and SEO notes.
`.trim(),

  'General Assistant': `
For UI/page requests (login forms, landing pages, simple dashboards):
- Always deliver as a self-contained html artifact with inline CSS.
`.trim(),
};

function buildArtifactInstructions(agentRole) {
  const roleHint = ROLE_HINTS[agentRole] || ROLE_HINTS['General Assistant'];
  return `${ARTIFACT_PROTOCOL}\n\n### Role-specific guidance (${agentRole})\n${roleHint}`;
}

module.exports = { buildArtifactInstructions, ARTIFACT_PROTOCOL };
