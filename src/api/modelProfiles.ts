/**
 * Pemilih model (0.10.16): 4 preset model yang bisa dipilih Sam di
 * Settings, bukan cuma satu BYO aktif.
 *
 * Arsitektur: jalur chat TIDAK berubah — ChatScreen tetap membaca
 * config aktif lewat getByo() (SecureStore "grokbot_byo") tiap turn.
 * Modul ini hanya mengatur config aktif itu:
 * - Preset berisi baseUrl + model (TANPA credential — tidak ada key
 *   yang di-hardcode, kecuali placeholder "none" untuk Big Pickle
 *   yang memang tidak butuh key).
 * - Credential tiap preset disimpan per-model di SecureStore
 *   ("grokbot_byo_profiles", map presetId -> ByoConfig), mengikuti
 *   pola penyimpanan BYO yang sudah ada (byo.ts).
 * - Preset aktif disimpan di AsyncStorage ("grokbot_active_model").
 * - Memilih preset = tulis config-nya ke "grokbot_byo" via saveByo()
 *   + tandai preset aktif. Bila preset belum punya credential
 *   tersimpan (dan bukan Big Pickle), activateModel melempar
 *   NO_CREDENTIAL — UI lalu meminta user import file BYO preset
 *   itu sekali (alur lama) atau isi credential sekali; credential
 *   itu diingat untuk pilihan berikutnya.
 * - Import file BYO (byo-import.json) tetap jalan seperti dulu;
 *   App.tsx memanggil recordImportedConfig() sesudah import sukses
 *   supaya credential-nya ikut diingat per-preset.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getByo, saveByo } from './byo';
import type { ByoConfig } from './types';

/** Satu preset model yang bisa dipilih di Settings. */
export interface ModelPreset {
  /** Id stabil, dipakai sebagai key penyimpanan credential. */
  id: string;
  /** Nama tampil di Settings. */
  name: string;
  /** Base URL provider (tanpa trailing slash). */
  baseUrl: string;
  /** Model yang dipakai preset ini. */
  model: string;
  /**
   * Credential bawaan bila preset tidak butuh key asli. Hanya
   * Big Pickle ("none" — relay free-bridge menerima Bearer apa
   * pun). BUKAN key asli; jangan isi key sungguhan di sini.
   */
  defaultCredential?: string;
  /** Penjelasan singkat untuk UI. */
  hint: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'agnes',
    name: 'Agnes',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    model: 'agnes-3.0-flash',
    hint: 'Agnes 3.0 Flash — cepat, stabil',
  },
  {
    id: 'poolside',
    name: 'Poolside Laguna',
    baseUrl: 'https://inference.poolside.ai/v1',
    model: 'poolside/laguna-s-2.1',
    hint: 'Laguna S 2.1 — paling frontier, unlimited',
  },
  {
    id: 'samai',
    name: 'Sam AI',
    baseUrl: 'http://YOUR_SERVER:3001/v1',
    model: 'auto',
    hint: 'Router Sam AI — auto pilih model terbaik',
  },
  {
    id: 'bigpickle',
    name: 'Big Pickle',
    baseUrl: 'http://YOUR_SERVER:20129/v1',
    model: 'big-pickle',
    defaultCredential: 'none',
    hint: 'OpenCode big-pickle via free-bridge (tanpa key)',
  },
];

/** SecureStore: map presetId -> ByoConfig (credential per-model). */
export const MODEL_PROFILES_STORE_KEY = 'grokbot_byo_profiles';

/** AsyncStorage: id preset yang sedang aktif ('custom' bila BYO bebas). */
export const ACTIVE_MODEL_KEY = 'grokbot_active_model';

/** Id untuk config BYO yang tidak cocok preset mana pun. */
export const CUSTOM_MODEL_ID = 'custom';

/** Pesan error activateModel bila preset belum punya credential. */
export const NO_CREDENTIAL_MESSAGE = 'NO_CREDENTIAL';

/** Cari preset berdasarkan id; null bila tidak dikenal. */
export function getPreset(id: string | null | undefined): ModelPreset | null {
  if (!id) return null;
  return MODEL_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Tebak preset dari base URL (cocok persis, tanpa trailing slash).
 * Dipakai untuk memulihkan preset aktif dari config BYO yang
 * tersimpan (yang tidak punya field preset sendiri) dan untuk
 * mencocokkan hasil import file BYO ke preset.
 */
export function inferPresetId(baseUrl: string | null | undefined): string {
  const url = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!url) return CUSTOM_MODEL_ID;
  return MODEL_PRESETS.find((p) => p.baseUrl === url)?.id ?? CUSTOM_MODEL_ID;
}

type ProfileMap = Record<string, ByoConfig>;

function parseProfileMap(raw: string | null): ProfileMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ProfileMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const cfg = value as Partial<ByoConfig>;
      if (
        typeof cfg.baseUrl === 'string' &&
        typeof cfg.model === 'string' &&
        typeof cfg.credential === 'string'
      ) {
        out[key] = {
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          credential: cfg.credential.trim(),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Semua credential per-model yang tersimpan (id preset -> config). */
export async function getModelProfiles(): Promise<ProfileMap> {
  const raw = await SecureStore.getItemAsync(MODEL_PROFILES_STORE_KEY);
  return parseProfileMap(raw);
}

/** Credential tersimpan untuk satu preset; null bila belum ada. */
export async function getModelProfile(id: string): Promise<ByoConfig | null> {
  const map = await getModelProfiles();
  return map[id] ?? null;
}

/** Simpan credential untuk satu preset (preset lain tidak tersentuh). */
export async function saveModelProfile(id: string, cfg: ByoConfig): Promise<void> {
  const preset = getPreset(id);
  if (!preset) throw new Error(`Preset model tidak dikenal: ${id}`);
  const baseUrl = cfg.baseUrl.trim().replace(/\/+$/, '');
  const model = cfg.model.trim();
  const credential = cfg.credential.trim();
  if (!baseUrl) throw new Error('BYO base URL must not be empty.');
  if (!model) throw new Error('BYO model must not be empty.');
  if (!credential) throw new Error('BYO credential must not be empty.');
  const map = await getModelProfiles();
  map[id] = { baseUrl, model, credential };
  await SecureStore.setItemAsync(MODEL_PROFILES_STORE_KEY, JSON.stringify(map));
}

/** Hapus credential tersimpan satu preset (config aktif tidak berubah). */
export async function deleteModelProfile(id: string): Promise<void> {
  const map = await getModelProfiles();
  if (!(id in map)) return;
  delete map[id];
  await SecureStore.setItemAsync(MODEL_PROFILES_STORE_KEY, JSON.stringify(map));
}

/**
 * Id preset yang sedang aktif. Bila belum pernah disimpan, ditebak
 * dari config BYO aktif (base URL-nya); bila tidak ada config,
 * 'custom'.
 */
export async function getActiveModelId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_MODEL_KEY);
    if (stored && getPreset(stored)) return stored;
  } catch {
    // AsyncStorage gagal — jatuh ke tebakan dari config BYO.
  }
  const byo = await getByo().catch(() => null);
  return inferPresetId(byo?.baseUrl ?? null);
}

export async function setActiveModelId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_MODEL_KEY, id);
}

/**
 * Aktifkan satu preset: tulis config-nya (baseUrl + model preset,
 * credential tersimpan / argumen / default preset) ke config BYO
 * aktif via saveByo(), lalu tandai preset aktif.
 *
 * Melempar Error(NO_CREDENTIAL_MESSAGE) bila preset belum punya
 * credential tersimpan dan tidak ada credential bawaan — pemanggil
 * (UI) harus meminta user import/isi credential preset itu sekali.
 * Tidak ada yang ditulis ke config aktif bila melempar.
 */
export async function activateModel(
  id: string,
  credential?: string,
): Promise<ByoConfig> {
  const preset = getPreset(id);
  if (!preset) throw new Error(`Preset model tidak dikenal: ${id}`);
  const profile = await getModelProfile(id);
  const cred = (credential ?? '').trim() || profile?.credential || preset.defaultCredential;
  if (!cred) throw new Error(NO_CREDENTIAL_MESSAGE);
  const cfg: ByoConfig = {
    baseUrl: preset.baseUrl,
    model: preset.model,
    credential: cred,
  };
  await saveByo(cfg);
  // Ingat credential-nya untuk pilihan berikutnya (kecuali bila
  // credential berasal dari default bawaan preset).
  if (!profile && preset.defaultCredential !== cred) {
    await saveModelProfile(id, cfg);
  }
  await setActiveModelId(id);
  return cfg;
}

/**
 * Catat hasil import file BYO (byo-import.json) ke profil preset
 * yang cocok dengan base URL-nya, supaya credential itu diingat
 * untuk pilihan berikutnya. Dipanggil App.tsx sesudah import
 * sukses. Mengembalikan id preset yang dicocokkan, atau 'custom'
 * bila base URL tidak cocok preset mana pun (tidak ada yang
 * dicatat, tapi preset aktif tetap diperbarui).
 */
export async function recordImportedConfig(cfg: ByoConfig): Promise<string> {
  const id = inferPresetId(cfg.baseUrl);
  if (id === CUSTOM_MODEL_ID) {
    await setActiveModelId(CUSTOM_MODEL_ID);
    return CUSTOM_MODEL_ID;
  }
  await saveModelProfile(id, cfg);
  await setActiveModelId(id);
  return id;
}
