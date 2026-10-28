/**
 * Tests for the model picker (modelProfiles.ts, 0.10.16).
 *
 * SecureStore + AsyncStorage are in-memory maps — no native code,
 * no real network. No credential value ever leaves the test (all
 * keys here are fake 'test-key-*' strings).
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getByo } from '../byo';
import {
  ACTIVE_MODEL_KEY,
  CUSTOM_MODEL_ID,
  MODEL_PRESETS,
  MODEL_PROFILES_STORE_KEY,
  NO_CREDENTIAL_MESSAGE,
  activateModel,
  deleteModelProfile,
  getActiveModelId,
  getModelProfile,
  getModelProfiles,
  getPreset,
  inferPresetId,
  recordImportedConfig,
  saveModelProfile,
  setActiveModelId,
} from '../modelProfiles';
import type { ByoConfig } from '../types';

jest.mock(
  'expo-secure-store',
  () => {
    const store = new Map<string, string>();
    return {
      __store: store,
      getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      deleteItemAsync: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
  },
  { virtual: true },
);

jest.mock(
  '@react-native-async-storage/async-storage',
  () => {
    const store = new Map<string, string>();
    return {
      __store: store,
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
  },
  { virtual: true },
);

function secureStoreMap(): Map<string, string> {
  return (SecureStore as unknown as { __store: Map<string, string> }).__store;
}

function asyncStoreMap(): Map<string, string> {
  return (AsyncStorage as unknown as { __store: Map<string, string> }).__store;
}

beforeEach(() => {
  secureStoreMap().clear();
  asyncStoreMap().clear();
});

const AGNES_CFG: ByoConfig = {
  baseUrl: 'https://apihub.agnes-ai.com/v1',
  model: 'agnes-3.0-flash',
  credential: 'test-key-agnes',
};

const POOLSIDE_CFG: ByoConfig = {
  baseUrl: 'https://inference.poolside.ai/v1',
  model: 'poolside/laguna-s-2.1',
  credential: 'test-key-poolside',
};

describe('MODEL_PRESETS', () => {
  it('has exactly the 4 presets Sam asked for, with the right endpoints', () => {
    expect(MODEL_PRESETS.map((p) => p.id)).toEqual([
      'agnes',
      'poolside',
      'samai',
      'bigpickle',
    ]);
    expect(getPreset('agnes')).toMatchObject({
      baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-3.0-flash',
    });
    expect(getPreset('poolside')).toMatchObject({
      baseUrl: 'https://inference.poolside.ai/v1',
      model: 'poolside/laguna-s-2.1',
    });
    expect(getPreset('samai')).toMatchObject({
      baseUrl: 'http://YOUR_SERVER:3001/v1',
      model: 'auto',
    });
    expect(getPreset('bigpickle')).toMatchObject({
      baseUrl: 'http://YOUR_SERVER:20129/v1',
      model: 'big-pickle',
    });
  });

  it('carries no real credential — only Big Pickle has the "none" placeholder', () => {
    for (const p of MODEL_PRESETS) {
      if (p.id === 'bigpickle') {
        expect(p.defaultCredential).toBe('none');
      } else {
        expect(p.defaultCredential).toBeUndefined();
      }
    }
    expect(getPreset('nope')).toBeNull();
  });
});

describe('inferPresetId', () => {
  it('matches preset base URLs (trailing slash tolerated)', () => {
    expect(inferPresetId('https://apihub.agnes-ai.com/v1')).toBe('agnes');
    expect(inferPresetId('https://inference.poolside.ai/v1/')).toBe('poolside');
    expect(inferPresetId('http://YOUR_SERVER:3001/v1')).toBe('samai');
    expect(inferPresetId('http://YOUR_SERVER:20129/v1')).toBe('bigpickle');
  });

  it('returns custom for unknown or empty URLs', () => {
    expect(inferPresetId('https://api.openai.com/v1')).toBe(CUSTOM_MODEL_ID);
    expect(inferPresetId('')).toBe(CUSTOM_MODEL_ID);
    expect(inferPresetId(undefined)).toBe(CUSTOM_MODEL_ID);
  });
});

describe('per-model credential profiles', () => {
  it('saves and reads one profile without touching others', async () => {
    await saveModelProfile('agnes', AGNES_CFG);
    await saveModelProfile('poolside', POOLSIDE_CFG);
    expect(await getModelProfile('agnes')).toEqual(AGNES_CFG);
    expect(await getModelProfile('poolside')).toEqual(POOLSIDE_CFG);
    expect(await getModelProfile('samai')).toBeNull();
    const all = await getModelProfiles();
    expect(Object.keys(all).sort()).toEqual(['agnes', 'poolside']);
  });

  it('rejects an unknown preset id and empty fields', async () => {
    await expect(saveModelProfile('nope', AGNES_CFG)).rejects.toThrow('tidak dikenal');
    await expect(
      saveModelProfile('agnes', { ...AGNES_CFG, credential: '  ' }),
    ).rejects.toThrow('must not be empty');
    expect(await getModelProfile('agnes')).toBeNull();
  });

  it('deleteModelProfile removes only that preset', async () => {
    await saveModelProfile('agnes', AGNES_CFG);
    await saveModelProfile('poolside', POOLSIDE_CFG);
    await deleteModelProfile('agnes');
    expect(await getModelProfile('agnes')).toBeNull();
    expect(await getModelProfile('poolside')).toEqual(POOLSIDE_CFG);
  });

  it('corrupt stored JSON is treated as no profiles, not a crash', async () => {
    secureStoreMap().set(MODEL_PROFILES_STORE_KEY, '{bukan json');
    expect(await getModelProfiles()).toEqual({});
    expect(await getModelProfile('agnes')).toBeNull();
  });
});

describe('activateModel', () => {
  it('activates a preset with a stored credential (writes active BYO + active id)', async () => {
    await saveModelProfile('agnes', AGNES_CFG);
    const cfg = await activateModel('agnes');
    expect(cfg).toEqual(AGNES_CFG);
    expect(await getByo()).toEqual(AGNES_CFG);
    expect(await getActiveModelId()).toBe('agnes');
    expect(asyncStoreMap().get(ACTIVE_MODEL_KEY)).toBe('agnes');
  });

  it('throws NO_CREDENTIAL and writes nothing when no credential is stored', async () => {
    await expect(activateModel('poolside')).rejects.toThrow(NO_CREDENTIAL_MESSAGE);
    expect(await getByo()).toBeNull();
    expect(await getActiveModelId()).toBe(CUSTOM_MODEL_ID);
  });

  it('Big Pickle activates without a stored credential (uses "none")', async () => {
    const cfg = await activateModel('bigpickle');
    expect(cfg).toEqual({
      baseUrl: 'http://YOUR_SERVER:20129/v1',
      model: 'big-pickle',
      credential: 'none',
    });
    expect(await getByo()).toEqual(cfg);
    expect(await getActiveModelId()).toBe('bigpickle');
    // Placeholder "none" is not remembered as a real profile.
    expect(await getModelProfile('bigpickle')).toBeNull();
  });

  it('an explicit credential activates and is remembered for next time', async () => {
    await activateModel('samai', 'test-key-samai');
    expect(await getByo()).toMatchObject({
      baseUrl: 'http://YOUR_SERVER:3001/v1',
      model: 'auto',
      credential: 'test-key-samai',
    });
    expect(await getModelProfile('samai')).toMatchObject({
      credential: 'test-key-samai',
    });
    // Second activation needs no credential argument anymore.
    await activateModel('samai');
    expect(await getByo()).toMatchObject({ credential: 'test-key-samai' });
  });

  it('rejects an unknown preset id', async () => {
    await expect(activateModel('nope')).rejects.toThrow('tidak dikenal');
  });
});

describe('getActiveModelId', () => {
  it('returns the stored id when it is a known preset', async () => {
    await setActiveModelId('poolside');
    expect(await getActiveModelId()).toBe('poolside');
  });

  it('falls back to inferring from the active BYO config', async () => {
    await saveModelProfile('poolside', POOLSIDE_CFG);
    await activateModel('poolside');
    // Simulate "never saved an active id": clear the flag only.
    asyncStoreMap().delete(ACTIVE_MODEL_KEY);
    expect(await getActiveModelId()).toBe('poolside');
  });

  it('returns custom when nothing is configured', async () => {
    expect(await getActiveModelId()).toBe(CUSTOM_MODEL_ID);
  });
});

describe('recordImportedConfig', () => {
  it('remembers an imported file config under its matching preset', async () => {
    const id = await recordImportedConfig(POOLSIDE_CFG);
    expect(id).toBe('poolside');
    expect(await getModelProfile('poolside')).toEqual(POOLSIDE_CFG);
    expect(await getActiveModelId()).toBe('poolside');
    // The picker can now activate it without asking for a key.
    await activateModel('poolside');
    expect(await getByo()).toEqual(POOLSIDE_CFG);
  });

  it('returns custom and stores nothing for an unknown base URL', async () => {
    const id = await recordImportedConfig({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      credential: 'test-key-openai',
    });
    expect(id).toBe(CUSTOM_MODEL_ID);
    expect(await getModelProfiles()).toEqual({});
    expect(await getActiveModelId()).toBe(CUSTOM_MODEL_ID);
  });
});
