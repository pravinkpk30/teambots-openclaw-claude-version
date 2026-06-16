#!/usr/bin/env node
/**
 * Quick local test for bridge/artifacts.js (no gateway required).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teambots-artifacts-'));
process.env.TEAMBOTS_ARTIFACTS_DIR = tmpDir;
process.env.HOME = os.tmpdir();

const { processResponseArtifacts } = require('../bridge/artifacts');

const sample = `Here's your login page.

<!-- teambots-artifact
{"type":"html","title":"Login Page","filename":"login-page.html"}
-->

\`\`\`html
<!DOCTYPE html>
<html><head><title>Login</title></head>
<body><h1>Login</h1></body></html>
\`\`\`
`;

(async () => {
  const { message, artifacts } = await processResponseArtifacts(sample, {
    conversationId: 'test_conv',
    agentRole: 'General Assistant',
    log: () => {},
  });

  console.log('Message:', message);
  console.log('Artifacts:', JSON.stringify(artifacts, null, 2));
  if (artifacts.length !== 1) {
    console.error('Expected 1 artifact');
    process.exit(1);
  }
  const file = path.join(tmpDir, artifacts[0].filename);
  if (!fs.existsSync(file)) {
    console.error('Artifact file missing');
    process.exit(1);
  }
  console.log('OK — artifact saved at', file);
})();
