/**
 * Map hire-time LLM ids → OpenClaw model refs (provider/model).
 * Registers models not in OpenClaw's bundled catalog in openclaw.json.
 */

const OPENCLAW_KNOWN_GOOGLE_REFS = new Set([
  'google/gemini-3-flash-preview',
  'google/gemini-2.0-flash',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-pro',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3.1-pro',
]);

const OPENCLAW_KNOWN_OPENAI_REFS = new Set([
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4-turbo',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'openai/o3-mini',
  'openai/o1',
  'openai/o1-mini',
  'openai/gpt-3.5-turbo',
]);

const OPENCLAW_KNOWN_ANTHROPIC_REFS = new Set([
  'anthropic/claude-3-5-haiku-20241022',
  'anthropic/claude-3-5-sonnet-20241022',
  'anthropic/claude-3-opus-20240229',
  'anthropic/claude-3-7-sonnet-20250219',
  'anthropic/claude-sonnet-4-20250514',
]);

const KNOWN_BY_PROVIDER = {
  google: OPENCLAW_KNOWN_GOOGLE_REFS,
  gemini: OPENCLAW_KNOWN_GOOGLE_REFS,
  openai: OPENCLAW_KNOWN_OPENAI_REFS,
  anthropic: OPENCLAW_KNOWN_ANTHROPIC_REFS,
};

function normalizeProvider(provider) {
  const p = String(provider || 'google').toLowerCase();
  if (p === 'gemini') return 'google';
  return p;
}

function resolveModelRef(provider, llmModel) {
  const ocProvider = normalizeProvider(provider);
  const raw = String(llmModel || '').trim();
  const known = KNOWN_BY_PROVIDER[ocProvider] || new Set();

  if (!raw) {
    const defaults = {
      google: 'google/gemini-2.0-flash',
      openai: 'openai/gpt-4o-mini',
      anthropic: 'anthropic/claude-3-5-haiku-20241022',
    };
    const modelRef = defaults[ocProvider] || 'google/gemini-2.0-flash';
    const apiModelId = modelRef.split('/').slice(1).join('/');
    return {
      apiModelId,
      modelRef,
      provider: ocProvider,
      needsOpenClawRegistration: !known.has(modelRef),
    };
  }

  if (raw.includes('/')) {
    const modelRef = raw;
    const apiModelId = raw.split('/').slice(1).join('/');
    const refProvider = raw.split('/')[0];
    return {
      apiModelId,
      modelRef,
      provider: normalizeProvider(refProvider),
      needsOpenClawRegistration: !known.has(modelRef),
    };
  }

  const modelRef = `${ocProvider}/${raw}`;
  return {
    apiModelId: raw,
    modelRef,
    provider: ocProvider,
    needsOpenClawRegistration: !known.has(modelRef),
  };
}

/** agents.defaults.models allowlist + optional alias to provider API id */
function buildAgentsModelsAllowlist(provider, primaryRef, apiModelId) {
  const ocProvider = normalizeProvider(provider);
  const known = KNOWN_BY_PROVIDER[ocProvider] || new Set();
  const allowlist = {};

  for (const ref of known) {
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

function buildProviderModelsEntry(apiModelId, modelRef) {
  const name = modelRef.includes('/') ? modelRef.split('/').slice(1).join('/') : modelRef;
  return [{ id: apiModelId, name }];
}

/**
 * OpenClaw 2026.6.x requires every allowlisted model to exist in
 * models.providers[provider].models[] — not just custom/unknown models.
 */
function buildProviderModelsCatalog(ocProvider, primaryRef, apiModelId) {
  const known = KNOWN_BY_PROVIDER[ocProvider] || new Set();
  const byId = new Map();

  for (const ref of known) {
    const id = ref.includes('/') ? ref.split('/').slice(1).join('/') : ref;
    byId.set(id, { id, name: id });
  }

  if (apiModelId) {
    byId.set(apiModelId, { id: apiModelId, name: apiModelId });
  } else if (primaryRef) {
    const id = primaryRef.split('/').slice(1).join('/');
    byId.set(id, { id, name: id });
  }

  return Array.from(byId.values());
}

/** @deprecated use buildProviderModelsEntry */
function buildGoogleProviderModels(apiModelId, modelRef) {
  return buildProviderModelsEntry(apiModelId, modelRef);
}

module.exports = {
  OPENCLAW_KNOWN_GOOGLE_REFS,
  OPENCLAW_KNOWN_OPENAI_REFS,
  OPENCLAW_KNOWN_ANTHROPIC_REFS,
  resolveModelRef,
  buildAgentsModelsAllowlist,
  buildGoogleProviderModels,
  buildProviderModelsEntry,
  buildProviderModelsCatalog,
  normalizeProvider,
};
