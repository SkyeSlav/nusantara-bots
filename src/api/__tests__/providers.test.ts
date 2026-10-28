/**
 * Tests for the BYO provider presets (providers.ts).
 * Pure data + lookup helpers — no native modules, no network.
 */
import {
  AGNES_MODELS,
  BIGPICKLE_MODELS,
  FREELLM_MODELS,
  OXIONAI_MODELS,
  POOLSIDE_MODELS,
  PROVIDERS,
  getModelsForProvider,
  getProvider,
  inferProviderId,
} from '../providers';

describe('PROVIDERS', () => {
  it('lists Agnes first and Custom last', () => {
    expect(PROVIDERS[0].id).toBe('agnes');
    expect(PROVIDERS[PROVIDERS.length - 1].id).toBe('custom');
  });

  it('Agnes preset has the right base URL, models and default', () => {
    const ag = getProvider('agnes');
    expect(ag.name).toBe('Agnes');
    expect(ag.baseUrl).toBe('https://apihub.agnes-ai.com/v1');
    expect(ag.defaultModel).toBe('agnes-3.0-flash');
    expect(AGNES_MODELS).toHaveLength(5);
    expect(AGNES_MODELS).toContain('agnes-3.0-flash');
    expect(AGNES_MODELS).toContain('agnes-2.5-pro-beta');
    expect(new Set(AGNES_MODELS).size).toBe(AGNES_MODELS.length);
    expect(getModelsForProvider('agnes')).toEqual(AGNES_MODELS);
  });

  it('FreeLLM Router preset has the right base URL, models and default', () => {
    const fr = getProvider('freellm');
    expect(fr.name).toBe('FreeLLM Router (Sam AI)');
    expect(fr.baseUrl).toBe('http://YOUR_SERVER:3001/v1');
    expect(fr.defaultModel).toBe('auto');
    expect(FREELLM_MODELS).toContain('auto');
    expect(FREELLM_MODELS).toContain('auto:sam ai');
    expect(FREELLM_MODELS).toContain('agnes-3.0-flash');
    expect(new Set(FREELLM_MODELS).size).toBe(FREELLM_MODELS.length);
    expect(getModelsForProvider('freellm')).toEqual(FREELLM_MODELS);
  });

  it('Poolside + Big Pickle presets (0.10.16) have the right base URLs and defaults', () => {
    const poolside = getProvider('poolside');
    expect(poolside.name).toBe('Poolside Laguna');
    expect(poolside.baseUrl).toBe('https://inference.poolside.ai/v1');
    expect(poolside.defaultModel).toBe('poolside/laguna-s-2.1');
    expect(POOLSIDE_MODELS).toContain('poolside/laguna-s-2.1');
    expect(new Set(POOLSIDE_MODELS).size).toBe(POOLSIDE_MODELS.length);
    const bp = getProvider('bigpickle');
    expect(bp.name).toBe('Big Pickle');
    expect(bp.baseUrl).toBe('http://YOUR_SERVER:20129/v1');
    expect(bp.defaultModel).toBe('big-pickle');
    expect(BIGPICKLE_MODELS).toEqual(['big-pickle']);
  });

  it('OxionAI preset has the right base URL and default model', () => {
    const ox = getProvider('oxionai');
    expect(ox.name).toBe('OxionAI');
    expect(ox.baseUrl).toBe('https://oxionai.com/v1');
    expect(ox.defaultModel).toBe('grok-4.6');
  });

  it('OxionAI model list has exactly 33 models and includes grok-4.6', () => {
    expect(OXIONAI_MODELS).toHaveLength(33);
    expect(OXIONAI_MODELS).toContain('grok-4.6');
    expect(OXIONAI_MODELS[0]).toBe('grok-4.6');
    // No duplicates.
    expect(new Set(OXIONAI_MODELS).size).toBe(OXIONAI_MODELS.length);
  });

  it('getModelsForProvider returns the OxionAI list', () => {
    expect(getModelsForProvider('oxionai')).toEqual(OXIONAI_MODELS);
    expect(getModelsForProvider('oxionai')).toHaveLength(33);
  });

  it('Custom provider has an empty base URL, model list and default', () => {
    const custom = getProvider('custom');
    expect(custom.baseUrl).toBe('');
    expect(custom.models).toEqual([]);
    expect(custom.defaultModel).toBe('');
    expect(getModelsForProvider('custom')).toEqual([]);
  });

  it('getProvider falls back to Custom for unknown ids', () => {
    expect(getProvider('nope').id).toBe('custom');
    expect(getProvider(undefined).id).toBe('custom');
    expect(getProvider(null).id).toBe('custom');
  });

  it('inferProviderId matches preset base URLs and defaults to custom', () => {
    expect(inferProviderId('https://apihub.agnes-ai.com/v1')).toBe('agnes');
    expect(inferProviderId('http://YOUR_SERVER:3001/v1')).toBe('freellm');
    expect(inferProviderId('https://inference.poolside.ai/v1')).toBe('poolside');
    expect(inferProviderId('http://YOUR_SERVER:20129/v1')).toBe('bigpickle');
    expect(inferProviderId('https://oxionai.com/v1')).toBe('oxionai');
    expect(inferProviderId('https://oxionai.com/v1/')).toBe('oxionai');
    expect(inferProviderId('https://api.openai.com/v1')).toBe('custom');
    expect(inferProviderId('')).toBe('custom');
    expect(inferProviderId(undefined)).toBe('custom');
  });
});
