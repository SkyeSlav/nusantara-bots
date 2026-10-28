import {
  AVATAR_PRESETS,
  avatarKey,
  clearAvatarOverride,
  cycleAvatar,
  getAvatarOverride,
  isValidAvatarStyle,
  loadAvatarOverrides,
  nextAvatarPreset,
  setAvatarOverride,
  type AvatarStorage,
} from '../avatar';
import {
  blobHash,
  blobStyleFor,
  clearAllAvatarOverrideCache,
  type BlobStyle,
} from '../blob';

// avatar.ts imports AsyncStorage (real module = ESM, tidak bisa
// di-parse Jest): mock seperti di deleteBot.test.ts / client.test.ts.
// Test ini memakai storage injeksi sendiri, jadi mock ini hanya
// mencegah Jest memuat modul aslinya.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => {
    const store = new Map<string, string>();
    return {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      getAllKeys: jest.fn(async () => [...store.keys()]),
      multiGet: jest.fn(async (keys: string[]) =>
        keys.map((k) => [k, store.get(k) ?? null] as const),
      ),
    };
  },
  { virtual: true },
);

/** Storage in-memory (pengganti AsyncStorage) untuk test. */
function fakeStorage(): { storage: AvatarStorage; store: Map<string, string> } {
  const store = new Map<string, string>();
  const storage: AvatarStorage = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
    removeItem: async (key) => {
      store.delete(key);
    },
    getAllKeys: async () => [...store.keys()],
    multiGet: async (keys) => keys.map((k) => [k, store.get(k) ?? null] as const),
  };
  return { storage, store };
}

beforeEach(() => {
  clearAllAvatarOverrideCache();
});

describe('AVATAR_PRESETS', () => {
  it('has 8 presets, all distinct and valid', () => {
    expect(AVATAR_PRESETS.length).toBe(8);
    const keys = new Set(AVATAR_PRESETS.map((p) => `${p.hue}/${p.variant}`));
    expect(keys.size).toBe(8);
    for (const p of AVATAR_PRESETS) {
      expect(isValidAvatarStyle(p)).toBe(true);
    }
  });
});

describe('avatarKey', () => {
  it('namespaces the key per bot', () => {
    expect(avatarKey('chief')).toBe('grokbot_avatar_chief');
  });
});

describe('isValidAvatarStyle', () => {
  it('accepts in-range integer hue + variant', () => {
    expect(isValidAvatarStyle({ hue: 0, variant: 0 })).toBe(true);
    expect(isValidAvatarStyle({ hue: 359, variant: 4 })).toBe(true);
  });

  it('rejects out-of-range or non-integer values', () => {
    expect(isValidAvatarStyle({ hue: 360, variant: 0 })).toBe(false);
    expect(isValidAvatarStyle({ hue: -1, variant: 0 })).toBe(false);
    expect(isValidAvatarStyle({ hue: 1.5, variant: 0 })).toBe(false);
    expect(isValidAvatarStyle({ hue: 100, variant: 5 })).toBe(false);
    expect(isValidAvatarStyle({ hue: 100, variant: -1 })).toBe(false);
    expect(isValidAvatarStyle({ hue: 100 })).toBe(false);
    expect(isValidAvatarStyle({ variant: 1 })).toBe(false);
    expect(isValidAvatarStyle(null)).toBe(false);
    expect(isValidAvatarStyle('biru')).toBe(false);
    expect(isValidAvatarStyle([100, 1])).toBe(false);
  });
});

describe('nextAvatarPreset', () => {
  it('advances to the next preset in order', () => {
    expect(nextAvatarPreset(AVATAR_PRESETS[0])).toEqual(AVATAR_PRESETS[1]);
    expect(nextAvatarPreset(AVATAR_PRESETS[3])).toEqual(AVATAR_PRESETS[4]);
  });

  it('wraps around after the last preset', () => {
    const last = AVATAR_PRESETS[AVATAR_PRESETS.length - 1];
    expect(nextAvatarPreset(last)).toEqual(AVATAR_PRESETS[0]);
  });

  it('starts from the first preset for a non-preset style (hash result)', () => {
    // 'chief' hashes to hue 301, variant 1 — not a preset.
    expect(blobStyleFor('chief')).toEqual({ hue: 301, variant: 1 });
    expect(nextAvatarPreset(blobStyleFor('chief'))).toEqual(AVATAR_PRESETS[0]);
  });
});

describe('override storage + fallback', () => {
  it('falls back to the deterministic hash with no override', async () => {
    const { storage } = fakeStorage();
    expect(await getAvatarOverride('chief', storage)).toBe(null);
    expect(blobStyleFor('chief')).toEqual({ hue: 301, variant: 1 });
  });

  it('uses the override when one is stored', async () => {
    const { storage } = fakeStorage();
    const style: BlobStyle = { hue: 45, variant: 4 };
    await setAvatarOverride('chief', style, storage);
    expect(await getAvatarOverride('chief', storage)).toEqual(style);
    expect(blobStyleFor('chief')).toEqual(style);
  });

  it('rejects saving an invalid style', async () => {
    const { storage } = fakeStorage();
    await expect(setAvatarOverride('chief', { hue: 999, variant: 0 }, storage)).rejects.toThrow();
    expect(blobStyleFor('chief')).toEqual({ hue: 301, variant: 1 });
  });

  it('returns null for corrupt or invalid stored values', async () => {
    const { storage, store } = fakeStorage();
    store.set(avatarKey('chief'), 'bukan json');
    expect(await getAvatarOverride('chief', storage)).toBe(null);
    store.set(avatarKey('chief'), JSON.stringify({ hue: 999, variant: 0 }));
    expect(await getAvatarOverride('chief', storage)).toBe(null);
    expect(blobStyleFor('chief')).toEqual({ hue: 301, variant: 1 });
  });

  it('clear restores the hash fallback', async () => {
    const { storage } = fakeStorage();
    await setAvatarOverride('chief', { hue: 45, variant: 4 }, storage);
    expect(blobStyleFor('chief')).toEqual({ hue: 45, variant: 4 });
    await clearAvatarOverride('chief', storage);
    expect(await getAvatarOverride('chief', storage)).toBe(null);
    expect(blobStyleFor('chief')).toEqual({ hue: 301, variant: 1 });
  });
});

describe('loadAvatarOverrides', () => {
  it('loads all stored overrides into the cache, ignoring the rest', async () => {
    const { storage, store } = fakeStorage();
    store.set(avatarKey('chief'), JSON.stringify({ hue: 45, variant: 4 }));
    store.set(avatarKey('scout'), JSON.stringify({ hue: 210, variant: 1 }));
    store.set(avatarKey('rusak'), 'bukan json');
    store.set('unrelated_key', JSON.stringify({ hue: 1, variant: 1 }));
    const loaded = await loadAvatarOverrides(storage);
    expect(loaded).toBe(2);
    expect(blobStyleFor('chief')).toEqual({ hue: 45, variant: 4 });
    expect(blobStyleFor('scout')).toEqual({ hue: 210, variant: 1 });
    // Entri rusak diabaikan: 'rusak' tetap memakai hash, bukan override.
    const h = blobHash('rusak');
    expect(blobStyleFor('rusak')).toEqual({ hue: h % 360, variant: h % 5 });
  });

  it('returns 0 when there is nothing to load', async () => {
    const { storage } = fakeStorage();
    expect(await loadAvatarOverrides(storage)).toBe(0);
  });
});

describe('cycleAvatar', () => {
  it('cycles through presets and persists each step', async () => {
    const { storage } = fakeStorage();
    // 'chief' hash bukan preset -> mulai dari preset pertama.
    expect(await cycleAvatar('chief', storage)).toEqual(AVATAR_PRESETS[0]);
    expect(blobStyleFor('chief')).toEqual(AVATAR_PRESETS[0]);
    expect(await cycleAvatar('chief', storage)).toEqual(AVATAR_PRESETS[1]);
    expect(blobStyleFor('chief')).toEqual(AVATAR_PRESETS[1]);
  });

  it('wraps around after the last preset', async () => {
    const { storage } = fakeStorage();
    const last = AVATAR_PRESETS[AVATAR_PRESETS.length - 1];
    await setAvatarOverride('chief', last, storage);
    expect(await cycleAvatar('chief', storage)).toEqual(AVATAR_PRESETS[0]);
  });
});
