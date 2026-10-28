/**
 * Vault kredensial (0.10.0, bagian G — pola referensi penuh).
 *
 * Aturan yang mengikat:
 * - Aplikasi HANYA pernah menerima/mengirim NILAI kredensial di
 *   dua tempat: form isi kredensial (input pengguna, secureTextEntry)
 *   dan POST /api/vault/secrets (ke server milik pengguna sendiri).
 *   Nilai TIDAK PERNAH masuk chat, log, atau
 *   daftar — GET hanya mengembalikan NAMA layanan yang tersimpan.
 * - Bot/model TIDAK PERNAH menerima nilai kredensial: tool
 *   list_secrets mengembalikan nama layanan saja; tool login
 *   memanggil server yang memakai nilai itu sendiri di sisi server.
 * - Penyimpanan server: file vault terenkripsi 0600 (vault_store.py);
 *   aplikasi tidak menyimpan password di AsyncStorage/SecureStore.
 */

import { apiFetch, apiJson } from './client';
import { ApiError } from './types';

/** Satu layanan yang kredensialnya tersimpan (TANPA nilai). */
export interface StoredSecret {
  service: string;
  label: string;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/vault/secrets — daftar layanan yang kredensialnya
 * tersimpan (nama saja). null on 401. Fail-soft di pemanggil bila
 * endpoint belum ada (404 -> ApiError; layar menampilkan jujur).
 */
export async function listSecrets(): Promise<StoredSecret[] | null> {
  const data = await apiJson<{ secrets: StoredSecret[] }>('/api/vault/secrets');
  if (data === null) return null;
  return Array.isArray(data.secrets) ? data.secrets : [];
}

/** GET /api/vault/secrets/:service — apakah layanan ini tersimpan. Fail-soft: gagal = false. */
export async function hasSecret(service: string): Promise<boolean> {
  try {
    const data = await apiJson<{ stored: boolean }>(
      `/api/vault/secrets/${encodeURIComponent(service)}`,
    );
    return data?.stored === true;
  } catch {
    return false;
  }
}

/**
 * POST /api/vault/secrets — simpan kredensial satu layanan.
 * Nilai password hanya lewat di body request ini ke server sendiri.
 * Throws ApiError bila server menolak (pesan ditampilkan apa adanya
 * di form — bukan sukses palsu).
 */
export async function saveSecret(input: {
  service: string;
  label?: string;
  username: string;
  password: string;
}): Promise<{ stored: boolean; service: string }> {
  const res = await apiFetch('/api/vault/secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: input.service.trim(),
      label: (input.label ?? input.service).trim(),
      username: input.username.trim(),
      password: input.password,
    }),
  });
  if (!res.ok) {
    let message = `Server returned HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (data && typeof data.error === 'string' && data.error) message = data.error;
    } catch {
      /* bukan JSON — pakai pesan status */
    }
    throw new ApiError(res.status, message);
  }
  const data = (await res.json()) as { stored?: unknown; service?: unknown };
  return { stored: data.stored === true, service: typeof data.service === 'string' ? data.service : input.service };
}

/** DELETE /api/vault/secrets/:service — hapus kredensial satu layanan. True bila server menghapus. */
export async function deleteSecret(service: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/vault/secrets/${encodeURIComponent(service)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Validasi input form kredensial di sisi aplikasi (sebelum dikirim). */
export function validateSecretInput(input: {
  service: string;
  username: string;
  password: string;
}): string | null {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.service.trim())) {
    return 'Nama layanan tidak valid (huruf kecil, angka, dan -).';
  }
  if (!input.username.trim()) return 'Username tidak boleh kosong.';
  if (!input.password) return 'Password tidak boleh kosong.';
  return null;
}
