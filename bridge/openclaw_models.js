/**
 * Map hire-time LLM ids (Google API) → OpenClaw model refs (google/...).
 * OpenClaw ships a fixed catalog; newer API models must be allowlisted in openclaw.json.
 * @see https://docs.openclaw.ai/providers/google
 */

/** Known in recent OpenClaw releases (bundled pi catalog) */
const OPENCLAW_KNOWN_GOOGLE_REFS = new Set([
  'google/gemini-3-flash-preview',
  'google/gemini-2.0-flash',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-pro',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.1-pro',
]);

function resolveModelRef(provider, llmModel) {
  const raw = String(llmModel || '').trim();
  if (!raw) {
    return {
      apiModelId: 'gemini-2.0-flash',
      modelRef: 'google/gemini-2.0-flash',
      needsOpenClawRegistration: false,
    };
  }

  if (raw.includes('/')) {
    const modelRef = raw;
    const apiModelId = raw.split('/').slice(1).join('/');
    return {
      apiModelId,
      modelRef,
      needsOpenClawRegistration: !OPENCLAW_KNOWN_GOOGLE_REFS.has(modelRef),
    };
  }

  const modelRef = `${provider}/${raw}`;
  return {
    apiModelId: raw,
    modelRef,
    needsOpenClawRegistration:
      provider === 'google' && !OPENCLAW_KNOWN_GOOGLE_REFS.has(modelRef),
  };
}

/** agents.defaults.models allowlist + optional alias to Google API id */
function buildAgentsModelsAllowlist(primaryRef, apiModelId) {
  const allowlist = {};
  for (const ref of OPENCLAW_KNOWN_GOOGLE_REFS) {
    allowlist[ref] = {};
  }
  if (primaryRef) {
    allowlist[primaryRef] =
      apiModelId && !primaryRef.endsWith(apiModelId)
        ? { alias: apiModelId }
        : {};
  }
  return allowlist;
}

/** Extra models[] entry for models.providers.google when not in bundled catalog */
function buildGoogleProviderModels(apiModelId, modelRef) {
  return [
    {
      id: apiModelId,
      name: modelRef.replace('google/', ''),
    },
  ];
}

module.exports = {
  OPENCLAW_KNOWN_GOOGLE_REFS,
  resolveModelRef,
  buildAgentsModelsAllowlist,
  buildGoogleProviderModels,
};
