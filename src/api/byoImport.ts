/**
 * One-time BYO import from a local file.
 *
 * Flow (setup awal saja): whoever sets the phone up writes a file
 * named `byo-import.json` into the app document directory, e.g.
 * via ADB push. On launch the app checks for that file; when it
 * exists it is read, validated, saved into SecureStore through the
 * existing saveByo(), and then DELETED immediately — no key trace
 * is left on disk.
 *
 * Security: the file is only ever read from the phone's own app
 * storage. Its contents are never logged, never shown in the UI,
 * and never sent to the local server (saveByo only writes to
 * SecureStore). A missing or invalid file is ignored silently —
 * the app never crashes over it.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { saveByo } from './byo';
import type { ByoConfig } from './types';

/** File the setup flow drops into the app document directory. */
export const BYO_IMPORT_FILENAME = 'byo-import.json';

export type ByoImportResult = 'imported' | 'absent' | 'invalid';

/** Minimal file-system surface this import needs (injectable for tests). */
export interface ByoImportFs {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
  readAsStringAsync: (uri: string) => Promise<string>;
  deleteAsync: (uri: string) => Promise<void>;
}

const defaultFs: ByoImportFs = {
  documentDirectory: FileSystem.documentDirectory,
  getInfoAsync: (uri) => FileSystem.getInfoAsync(uri),
  readAsStringAsync: (uri) => FileSystem.readAsStringAsync(uri),
  deleteAsync: (uri) => FileSystem.deleteAsync(uri),
};

/**
 * Validate raw file contents. Returns the config when the JSON is
 * an object with non-empty string baseUrl, model and credential;
 * null otherwise. Never throws, never logs.
 */
export function parseByoImport(raw: string): ByoConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const { baseUrl, model, credential } = parsed as Record<string, unknown>;
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null;
  if (typeof model !== 'string' || !model.trim()) return null;
  if (typeof credential !== 'string' || !credential) return null;
  return { baseUrl: baseUrl.trim(), model: model.trim(), credential };
}

/**
 * Try the one-time import. Returns 'imported' when a valid file was
 * saved to SecureStore and deleted, 'absent' when there is no file,
 * 'invalid' when the file cannot be read or fails validation.
 * Never throws and never logs file contents.
 */
export async function tryImportByoConfig(
  fs: ByoImportFs = defaultFs,
  save: (cfg: ByoConfig) => Promise<void> = saveByo,
): Promise<ByoImportResult> {
  try {
    const dir = fs.documentDirectory;
    if (!dir) return 'absent';
    const uri = dir + BYO_IMPORT_FILENAME;
    const info = await fs.getInfoAsync(uri).catch(() => null);
    if (!info || !info.exists) return 'absent';
    const raw = await fs.readAsStringAsync(uri).catch(() => null);
    if (raw === null) return 'invalid';
    const cfg = parseByoImport(raw);
    if (!cfg) return 'invalid';
    await save(cfg);
    // Delete immediately after a successful import — no key trace
    // left on disk. A failed delete is ignored; the next launch
    // re-imports the same (already stored) config harmlessly.
    await fs.deleteAsync(uri).catch(() => undefined);
    return 'imported';
  } catch {
    return 'invalid';
  }
}
