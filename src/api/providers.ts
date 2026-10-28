/**
 * Model provider presets for the BYO-API settings.
 *
 * A provider preset only fills in the base URL and the model list —
 * it never carries a credential. The credential is still entered by
 * the user in Settings and lives only in secure storage (see byo.ts).
 * The BYO call itself (baseUrl + "/chat/completions", Bearer auth,
 * SSE via XHR) is unchanged.
 *
 * The OxionAI model list was verified live against
 * https://oxionai.com/v1/models on 25 Oct 2026 (33 models).
 * The Agnes model list comes from the Agnes provider. The
 * FreeLLM Router list is a curated subset of a self-hosted
 * FreeLLM router, which aggregates hundreds of models — only the
 * most useful are listed here; 'auto' lets the router pick.
 * The FreeLLM and Big Pickle presets below point at a local
 * router / relay — replace YOUR_SERVER in their base URLs with
 * the address of your own PC running those services.
 */

export interface Provider {
  /** Stable id, e.g. "oxionai" | "custom". */
  id: string;
  /** Display name shown in Settings. */
  name: string;
  /** Provider base URL (no trailing slash). Empty for Custom. */
  baseUrl: string;
  /** Models offered by this provider. Empty for Custom (free text). */
  models: string[];
  /** Model selected by default when this provider is picked. */
  defaultModel: string;
}

export const OXIONAI_MODELS: string[] = [
  'grok-4.6',
  'grok-4.5',
  'claude-opus-5',
  'claude-opus-5.5',
  'claude-opus-4.8',
  'claude-opus-4.7',
  'claude-opus-4.6',
  'claude-sonnet-5',
  'claude-fable-5',
  'claude-fable-5.1',
  'claude-mythos-preview',
  'gpt-5.5',
  'gpt-5.5-pro',
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gemini-3.1-pro',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'qwen3.7-max',
  'qwen3.8-max',
  'qwen3.8-27b',
  'kimi-k2.6',
  'kimi-k3',
  'deepseek-v4-pro-max',
  'deepseek-v4-pro-0813',
  'deepseek-v4-flash-0731',
  'glm-5.2',
  'glm-5.3',
  'seed-2.1-pro',
  'seed-2.1-turbo',
  'gemma-2-2b',
  'muse-spark-1.1',
];

export const AGNES_MODELS: string[] = [
  'agnes-2.5-pro-alpha',
  'agnes-3.0-flash',
  'agnes-2.5-flash',
  'agnes-3.0-pro',
  'agnes-2.5-pro-beta',
];

/** Curated subset of the FreeLLM router models (router lists hundreds). */
export const FREELLM_MODELS: string[] = [
  'auto',
  'auto:sam ai',
  'agnes-3.0-flash',
  'agnes-2.5-pro',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'gpt-5.6-luna',
  'gemini-3.1-pro-preview',
  'deepseek-v4-flash',
  'kimi-k2.6',
  'qwen3.8-max',
  'glm-5.3',
  'big-pickle',
  'mimo-v2.6-flash',
  'nemotron-3.5-lightning',
];

export const POOLSIDE_MODELS: string[] = [
  'poolside/laguna-s-2.1',
  'poolside/laguna-xs-2.1',
];

export const BIGPICKLE_MODELS: string[] = ['big-pickle'];

export const PROVIDERS: Provider[] = [
  {
    id: 'agnes',
    name: 'Agnes',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    models: AGNES_MODELS,
    defaultModel: 'agnes-3.0-flash',
  },
  {
    id: 'freellm',
    name: 'FreeLLM Router (Sam AI)',
    baseUrl: 'http://YOUR_SERVER:3001/v1',
    models: FREELLM_MODELS,
    defaultModel: 'auto',
  },
  {
    id: 'poolside',
    name: 'Poolside Laguna',
    baseUrl: 'https://inference.poolside.ai/v1',
    models: POOLSIDE_MODELS,
    defaultModel: 'poolside/laguna-s-2.1',
  },
  {
    id: 'bigpickle',
    name: 'Big Pickle',
    baseUrl: 'http://YOUR_SERVER:20129/v1',
    models: BIGPICKLE_MODELS,
    defaultModel: 'big-pickle',
  },
  {
    id: 'oxionai',
    name: 'OxionAI',
    baseUrl: 'https://oxionai.com/v1',
    models: OXIONAI_MODELS,
    defaultModel: 'grok-4.6',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    models: [],
    defaultModel: '',
  },
];

/** Find a provider by id; falls back to the Custom provider. */
export function getProvider(id: string | null | undefined): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
}

/** Model list for a provider id (empty array for Custom). */
export function getModelsForProvider(id: string | null | undefined): string[] {
  return getProvider(id).models;
}

/**
 * Guess the provider from a saved base URL: exact match on a
 * preset base URL wins, anything else is Custom. Used to restore
 * the picker state from a stored BYO config (which has no
 * provider field of its own).
 */
export function inferProviderId(baseUrl: string | null | undefined): string {
  const url = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!url) return 'custom';
  return PROVIDERS.find((p) => p.baseUrl && p.baseUrl === url)?.id ?? 'custom';
}
