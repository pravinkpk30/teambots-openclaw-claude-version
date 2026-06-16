/**
 * bridge/pdfGenerator.js
 *
 * Converts HTML artifacts to PDF using wkhtmltopdf when available,
 * with a plain-text fallback via pdf-lib.
 */

'use strict';

const fs   = require('fs');
const { execFileSync } = require('child_process');

let PDFDocument;
try {
  PDFDocument = require('pdf-lib').PDFDocument;
} catch {
  PDFDocument = null;
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tryWkhtmltopdf(html, pdfPath, log) {
  try {
    execFileSync('wkhtmltopdf', ['-q', '-', pdfPath], {
      input: html,
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) {
      log('INFO', 'pdf generated via wkhtmltopdf', { pdfPath });
      return true;
    }
  } catch (err) {
    log('WARN', 'wkhtmltopdf unavailable or failed', { detail: err.message });
  }
  return false;
}

async function tryPdfLibText(html, pdfPath, log) {
  if (!PDFDocument) return false;
  try {
    const text = stripHtml(html);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const fontSize = 10;
    const margin = 50;
    const maxChars = 90;
    const lines = [];
    let line = '';

    for (const word of text.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (test.length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    let y = 742;
    for (const ln of lines) {
      if (y < margin) break;
      page.drawText(ln.slice(0, maxChars), { x: margin, y, size: fontSize });
      y -= fontSize + 5;
    }

    fs.writeFileSync(pdfPath, await pdfDoc.save());
    log('INFO', 'pdf generated via pdf-lib text fallback', { pdfPath });
    return true;
  } catch (err) {
    log('WARN', 'pdf-lib fallback failed', { detail: err.message });
    return false;
  }
}

async function tryGeneratePdfFromHtml(html, pdfPath, log) {
  if (tryWkhtmltopdf(html, pdfPath, log)) return true;
  return tryPdfLibText(html, pdfPath, log);
}

module.exports = { tryGeneratePdfFromHtml, stripHtml };
