// frontend/src/services/agentProfiles.js
// Defines the available agent roles, their descriptions, and default skills.

const profiles = [
  {
    id: 'general',
    role: 'General Assistant',
    jobTitle: 'AI Assistant',
    emoji: '🤖',
    description: 'A versatile assistant for everyday tasks, questions, and analysis.',
    skills: '',
    color: '#6366f1',
  },
  {
    id: 'invoice',
    role: 'Invoice Agent',
    jobTitle: 'Invoice Processing Specialist',
    emoji: '🧾',
    description: 'Creates, manages, and tracks invoices and billing documents.',
    skills: 'invoice',
    color: '#10b981',
  },
  {
    id: 'marketing',
    role: 'Marketing Researcher',
    jobTitle: 'Marketing Research Analyst',
    emoji: '📊',
    description: 'Deep market analysis, competitor research, and trend identification.',
    skills: 'summarize',
    color: '#f59e0b',
  },
  {
    id: 'competitive',
    role: 'Competitive Intelligence Analyst',
    jobTitle: 'Competitive Intelligence Specialist',
    emoji: '🔍',
    description: 'Tracks competitor moves, analyses industry trends, and surfaces insights.',
    skills: 'summarize,github',
    color: '#ef4444',
  },
  {
    id: 'content',
    role: 'Content Brief Writer',
    jobTitle: 'Content Strategy Specialist',
    emoji: '✍️',
    description: 'Writes detailed content briefs, outlines, and editorial guides.',
    skills: 'summarize',
    color: '#8b5cf6',
  },
  {
    id: 'sales',
    role: 'Sales Outreach Assistant',
    jobTitle: 'Sales Development Representative',
    emoji: '💼',
    description: 'Crafts personalised outreach, follow-ups, and sales copy.',
    skills: 'summarize',
    color: '#06b6d4',
  },
  {
    id: 'support',
    role: 'Customer Support Triage Agent',
    jobTitle: 'Customer Support Specialist',
    emoji: '🎧',
    description: 'Triages, categorises, and drafts responses for support tickets.',
    skills: 'summarize',
    color: '#ec4899',
  },
  {
    id: 'engineering',
    role: 'Engineering Research Assistant',
    jobTitle: 'Engineering Research Specialist',
    emoji: '⚙️',
    description: 'Researches technical problems, reviews code, and explores OSS solutions.',
    skills: 'summarize,github',
    color: '#14b8a6',
  },
];

export const LLM_PROVIDERS = [
  {
    id: 'google',
    label: 'Google (Gemini)',
    models: [
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    models: [
      'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    models: [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4-turbo',
    ],
  },
];

export default profiles;
