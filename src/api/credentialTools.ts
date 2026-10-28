/**
 * Tool kredensial untuk chat BYO (0.10.0, bagian G — pola referensi).
 *
 * Alur yang mengikat (bot TIDAK PERNAH melihat nilai password):
 *   1. Sebelum login ke layanan apa pun, model memanggil
 *      `list_secrets` — mengembalikan NAMA layanan yang tersimpan
 *      saja (kosong = belum ada).
 *   2. Bila belum ada, model memanggil `request_credential` —
 *      aplikasi menampilkan FORM AMAN (username + password,
 *      password tertutup) di chat. Pengguna isi + Simpan, atau
 *      Dismiss. Hasil tool hanya "tersimpan" / "ditolak" — nilai
 *      tidak pernah masuk percakapan.
 *   3. Bila sudah tersimpan, model memanggil `login_service` —
 *      server memakai kredensial vault sendiri untuk login via
 *      browser (POST /api/computer/login); nilai tidak pernah
 *      kembali ke model/chat.
 *
 * Eksekutor TIDAK PERNAH throw (semua kegagalan jadi teks hasil
 * tool yang jujur — sama seperti executeVmExecTool / executeBotTool).
 */

import { hasSecret, listSecrets, saveSecret } from './vault';
import { apiFetch } from './client';
import type { ChatTool, ParsedToolCall } from './byo';

export const LIST_SECRETS_TOOL_NAME = 'list_secrets';
export const REQUEST_CREDENTIAL_TOOL_NAME = 'request_credential';
export const LOGIN_SERVICE_TOOL_NAME = 'login_service';

export const LIST_SECRETS_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: LIST_SECRETS_TOOL_NAME,
    description:
      'Lihat layanan apa saja yang kredensialnya SUDAH tersimpan di vault (hanya nama layanan — nilainya tidak bisa dibaca). Panggil ini DULU sebelum login ke layanan apa pun. Bila daftar kosong, kredensial belum ada: jangan mengklaim bisa login, minta pengguna menyimpan dulu lewat request_credential.',
    parameters: { type: 'object', properties: {} },
  },
};

export const REQUEST_CREDENTIAL_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: REQUEST_CREDENTIAL_TOOL_NAME,
    description:
      'Minta pengguna menyimpan kredensial satu layanan lewat FORM AMAN (username + password, password tidak terlihat olehmu). Pakai bila list_secrets menunjukkan layanan belum tersimpan DAN pengguna meminta login ke layanan itu. JANGAN PERNAH meminta password ditulis di chat. Bila pengguna menutup form tanpa menyimpan, JANGAN memaksa atau mengulang permintaan di percakapan ini — tawarkan login manual saja.',
    parameters: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'Id layanan huruf kecil, mis. "youtube-studio".',
        },
        label: {
          type: 'string',
          description: 'Nama layanan yang tampil di form, mis. "Login YouTube Studio (Google)".',
        },
        url: {
          type: 'string',
          description: 'URL halaman login layanan itu (mis. "accounts.google.com").',
        },
      },
      required: ['service'],
    },
  },
};

export const LOGIN_SERVICE_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: LOGIN_SERVICE_TOOL_NAME,
    description:
      'Login ke satu layanan memakai kredensial yang SUDAH tersimpan di vault (server yang memakai nilainya sendiri — kamu tidak pernah menerima password). Panggil HANYA setelah list_secrets memastikan layanan tersimpan. Bila gagal, laporkan kegagalannya dengan jujur dan jangan mengarang bahwa login berhasil.',
    parameters: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'Id layanan yang kredensialnya tersimpan, mis. "youtube-studio".',
        },
      },
      required: ['service'],
    },
  },
};

export const CREDENTIAL_TOOLS: ChatTool[] = [
  LIST_SECRETS_TOOL,
  REQUEST_CREDENTIAL_TOOL,
  LOGIN_SERVICE_TOOL,
];

/**
 * URL halaman login per layanan (dipakai jalur fallback login:
 * bila login otomatis gagal, model membuka URL ini langsung dengan
 * open_browser — JANGAN tab kosong. Sama dengan mapping server
 * (computer.py SERVICE_URLS); aplikasi hanya memakainya untuk
 * memberi tahu model URL fallback, bukan untuk login sendiri.
 */
export const SERVICE_URLS: Record<string, string> = {
  'youtube-studio': 'https://studio.youtube.com',
  youtube: 'https://www.youtube.com',
  gmail: 'https://mail.google.com',
  google: 'https://www.google.com',
  github: 'https://github.com',
};

/** Hasil callback form kredensial dari aplikasi (ChatScreen). */
export type CredentialFormResult = { saved: boolean };

/**
 * Eksekutor list_secrets — hanya nama layanan, tanpa nilai.
 */
export async function executeListSecretsTool(): Promise<string> {
  let secrets: Awaited<ReturnType<typeof listSecrets>>;
  try {
    secrets = await listSecrets();
  } catch {
    return 'Tidak bisa membaca vault (server tidak menjawab). Jangan mengklaim kredensial apa pun tersimpan.';
  }
  if (secrets === null) {
    return 'Tidak bisa membaca vault (server meminta token). Jangan mengklaim kredensial apa pun tersimpan.';
  }
  if (secrets.length === 0) {
    return 'Belum ada kredensial tersimpan (list_secrets kosong). Bila pengguna meminta login ke suatu layanan, minta mereka menyimpan dulu lewat request_credential — jangan mengklaim bisa login.';
  }
  return (
    `Kredensial tersimpan di vault (${secrets.length}): ` +
    secrets.map((s) => s.service).join(', ') +
    '. (Hanya nama layanan — nilainya tidak bisa dibaca.)'
  );
}

function validService(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

/**
 * Eksekutor request_credential — menampilkan form aman lewat
 * callback aplikasi. TIDAK PERNAH throw.
 */
export async function executeRequestCredentialTool(
  call: ParsedToolCall,
  requestCredential: (input: {
    service: string;
    label: string;
    url: string;
  }) => Promise<CredentialFormResult>,
): Promise<string> {
  if (!call.argsValid) {
    return 'Argumen request_credential tidak valid (bukan JSON objek). Berikan service sebagai string.';
  }
  const args = (call.args ?? {}) as Record<string, unknown>;
  if (!validService(args.service)) {
    return 'request_credential gagal: service harus berupa id layanan huruf kecil (mis. "youtube-studio").';
  }
  const service = args.service as string;
  const label =
    typeof args.label === 'string' && args.label.trim()
      ? args.label.trim()
      : `Login ${service}`;
  const url = typeof args.url === 'string' ? args.url.trim() : '';
  // Bila sudah tersimpan, jangan tampilkan form lagi — beri tahu model.
  if (await hasSecret(service)) {
    return `Kredensial ${service} SUDAH tersimpan di vault — tidak perlu form lagi. Kamu bisa login sekarang lewat login_service.`;
  }
  const result = await requestCredential({ service, label, url });
  if (result.saved) {
    return (
      `Kredensial ${service} sudah tersimpan di vault. ` +
      `Kamu bisa login sekarang lewat login_service tanpa meminta password lagi.`
    );
  }
  return (
    `Pengguna menutup form ${service} tanpa menyimpan kredensial. ` +
    `Jangan memaksa atau mengulang permintaan di percakapan ini — ` +
    `tawarkan pengguna login manual sendiri bila mereka mau.`
  );
}

/**
 * Eksekutor login_service — server memakai kredensial vault sendiri.
 * TIDAK PERNAH throw; nilai tidak pernah kembali ke model.
 *
 * Polish chat (0.10.0, bagian J):
 * - 2FA BUKAN kegagalan: bila server mengembalikan sinyal
 *   needs_user_action "2fa" (atau pesannya menyebut verifikasi
 *   2 langkah), hasil tool menyuruh model memberi instruksi biasa
 *   ke pengguna dan MENUNGGU — jangan tampilkan error, jangan
 *   klaim login gagal.
 * - Gagal biasa: hasil tool menyuruh model COBA JALUR LAIN SENDIRI
 *   (buka URL layanan langsung dengan open_browser) — jangan
 *   tampilkan error mentah ke pengguna. URL fallback = `url` dari
 *   server bila ada, atau SERVICE_URLS.
 */
export async function executeLoginServiceTool(call: ParsedToolCall): Promise<string> {
  if (!call.argsValid) {
    return 'Argumen login_service tidak valid (bukan JSON objek).';
  }
  const args = (call.args ?? {}) as Record<string, unknown>;
  if (!validService(args.service)) {
    return 'login_service gagal: service harus berupa id layanan huruf kecil (mis. "youtube-studio").';
  }
  const service = args.service as string;
  const fallbackUrl = SERVICE_URLS[service] ?? '';
  if (!(await hasSecret(service))) {
    return (
      `Login ke ${service} TIDAK BISA: kredensial belum tersimpan (list_secrets kosong untuk layanan ini). ` +
      `Minta pengguna menyimpan dulu lewat request_credential — jangan mengklaim login berhasil.`
    );
  }
  let res: Response;
  try {
    res = await apiFetch('/api/computer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service }),
    });
  } catch {
    return loginFailedText(service, fallbackUrl, 'server tidak menjawab.');
  }
  if (!res.ok) {
    let message = 'server menolak login.';
    let serverUrl = '';
    try {
      const data = (await res.json()) as { error?: unknown; url?: unknown };
      if (data && typeof data.error === 'string' && data.error) message = data.error;
      if (data && typeof data.url === 'string' && data.url) serverUrl = data.url;
    } catch {
      /* bukan JSON — pakai pesan biasa */
    }
    return loginFailedText(service, serverUrl || fallbackUrl, message);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    return loginFailedText(service, fallbackUrl, 'server menjawab dengan format yang tidak dikenal.');
  }
  const d = (data ?? {}) as Record<string, unknown>;
  // 2FA: sinyal terstruktur server (needs_user_action) ATAU pesan yang
  // menyebut verifikasi — keduanya berarti "tunggu user", bukan gagal.
  const needs2fa =
    d.needs_user_action === '2fa' ||
    (typeof d.error === 'string' && /2fa|2-step|verifikasi tambahan|verify/i.test(d.error));
  if (needs2fa) {
    return (
      `Login ke ${service}: layanan meminta verifikasi 2 langkah. ` +
      `Ini BUKAN kegagalan — beri tahu pengguna dengan bahasa biasa: cek HP-nya, tap Yes di notifikasi ` +
      `'Verify it's you' dari Google, lalu beri tahu kamu bila sudah. TUNGGU konfirmasi pengguna — ` +
      `jangan menampilkan error dan jangan mengklaim login gagal.`
    );
  }
  if (d.ok === false) {
    const err = typeof d.error === 'string' && d.error ? d.error : 'gagal tanpa pesan error.';
    const serverUrl = typeof d.url === 'string' && d.url ? d.url : '';
    return loginFailedText(service, serverUrl || fallbackUrl, err);
  }
  const url = typeof d.url === 'string' && d.url ? ` (${d.url})` : '';
  return `Login ke ${service} berhasil${url}. Kredensial dipakai dari vault — kamu tidak pernah melihat nilainya.`;
}

/** Teks hasil login-gagal (J): alasan biasa + perintah coba jalur lain, tanpa error mentah. */
function loginFailedText(service: string, fallbackUrl: string, reason: string): string {
  const fallback = fallbackUrl
    ? ` Coba jalur lain SENDIRI dulu: buka browser ke ${fallbackUrl} dengan open_browser, lalu pandu pengguna login manual — jangan tampilkan error ini ke pengguna.`
    : '';
  return `Login ke ${service} belum berhasil: ${reason} Jangan mengklaim login berhasil.${fallback}`;
}

/** Dispatcher tool kredensial (dipakai router gabungan ChatScreen). */
export async function executeCredentialTool(
  call: ParsedToolCall,
  requestCredential: (input: {
    service: string;
    label: string;
    url: string;
  }) => Promise<CredentialFormResult>,
): Promise<string> {
  switch (call.name) {
    case LIST_SECRETS_TOOL_NAME:
      return executeListSecretsTool();
    case REQUEST_CREDENTIAL_TOOL_NAME:
      return executeRequestCredentialTool(call, requestCredential);
    case LOGIN_SERVICE_TOOL_NAME:
      return executeLoginServiceTool(call);
    default:
      return 'Tool kredensial itu tidak dikenal.';
  }
}
