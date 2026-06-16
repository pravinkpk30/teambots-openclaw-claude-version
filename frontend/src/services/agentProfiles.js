// frontend/src/services/agentProfiles.js
// Agent roles + LLM provider/model catalog for the Hire page.

/** @typedef {{ id: string, label: string }} LlmModelOption */

const profiles = [
  {
    id: 'general',
    role: 'General Assistant',
    jobTitle: 'AI Assistant',
    emoji: '🤖',
    description: 'A versatile assistant for everyday tasks, questions, and analysis.',
    skills: '',
    enableWebSearch: true,
    color: '#6366f1',
  },
  {
    id: 'invoice',
    role: 'Invoice Agent',
    jobTitle: 'Invoice Processing Specialist',
    emoji: '🧾',
    description: 'Creates, manages, and tracks invoices and billing documents.',
    skills: 'invoice',
    enableWebSearch: false,
    color: '#10b981',
  },
  {
    id: 'marketing',
    role: 'Marketing Researcher',
    jobTitle: 'Marketing Research Analyst',
    emoji: '📊',
    description: 'Deep market analysis, competitor research, and trend identification.',
    skills: 'summarize',
    enableWebSearch: true,
    color: '#f59e0b',
  },
  {
    id: 'competitive',
    role: 'Competitive Intelligence Analyst',
    jobTitle: 'Competitive Intelligence Specialist',
    emoji: '🔍',
    description: 'Tracks competitor moves, analyses industry trends, and surfaces insights.',
    skills: 'summarize,github',
    enableWebSearch: true,
    color: '#ef4444',
  },
  {
    id: 'content',
    role: 'Content Brief Writer',
    jobTitle: 'Content Strategy Specialist',
    emoji: '✍️',
    description: 'Writes detailed content briefs, outlines, and editorial guides.',
    skills: 'summarize',
    enableWebSearch: true,
    color: '#8b5cf6',
  },
  {
    id: 'sales',
    role: 'Sales Outreach Assistant',
    jobTitle: 'Sales Development Representative',
    emoji: '💼',
    description: 'Crafts personalised outreach, follow-ups, and sales copy.',
    skills: 'summarize',
    enableWebSearch: true,
    color: '#06b6d4',
  },
  {
    id: 'support',
    role: 'Customer Support Triage Agent',
    jobTitle: 'Customer Support Specialist',
    emoji: '🎧',
    description: 'Triages, categorises, and drafts responses for support tickets.',
    skills: 'summarize',
    enableWebSearch: false,
    color: '#ec4899',
  },
  {
    id: 'engineering',
    role: 'Engineering Research Assistant',
    jobTitle: 'Engineering Research Specialist',
    emoji: '⚙️',
    description: 'Researches technical problems, reviews code, and explores OSS solutions.',
    skills: 'summarize,github',
    enableWebSearch: true,
    color: '#14b8a6',
  },
];

export const LLM_PROVIDERS = [
  {
    id: 'google',
    label: 'Google (Gemini)',
    apiKeyPlaceholder: 'AIza… (Google AI Studio / Gemini API key)',
    apiKeyHelpUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    apiKeyPlaceholder: 'sk-… (OpenAI API key)',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o (best overall)' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast & affordable)' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
      { id: 'o3-mini', label: 'o3-mini (reasoning)' },
      { id: 'o1', label: 'o1 (advanced reasoning)' },
      { id: 'o1-mini', label: 'o1-mini' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (legacy)' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    apiKeyPlaceholder: 'sk-ant-… (Anthropic API key)',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (fast)' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    ],
  },
];

/** @param {string | LlmModelOption} model */
export function getModelId(model) {
  return typeof model === 'string' ? model : model.id;
}

/** @param {string | LlmModelOption} model */
export function getModelLabel(model) {
  return typeof model === 'string' ? model : model.label;
}

/** @param {string} providerId */
export function findProvider(providerId) {
  return LLM_PROVIDERS.find(p => p.id === providerId) || LLM_PROVIDERS[0];
}

/** @param {string} providerId */
export function getDefaultModelId(providerId) {
  const p = findProvider(providerId);
  return getModelId(p.models[0]);
}

export default profiles;
