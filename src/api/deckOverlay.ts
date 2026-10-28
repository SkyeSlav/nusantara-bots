/**
 * Helper murni untuk overlay deck kantor 3D (0.9.8, polish Ghost3D).
 *
 * Nameplate + speech bubble di deck TIDAK dirender di dalam Canvas
 * (tiga + fiber): React Native tidak punya canvas 2D untuk
 * CanvasTexture, dan @react-three/drei TIDAK terpasang (troika Text
 * butuh font eksternal + dependensi baru). Sebagai gantinya, posisi
 * layar tiap blob dihitung dari kamera (proyeksi orthographic) dan
 * nameplate/bubble dirender sebagai View RN biasa di atas Canvas —
 * teks native yang tajam, tanpa dependensi baru.
 *
 * Semua fungsi di sini murni (tanpa three, tanpa RN) dan teruji.
 */

export interface DeckOverlayItem {
  botId: string;
  /** Nama pendek untuk nameplate (sudah dipendekkan). */
  name: string;
  working: boolean;
  /** Isi bubble (null = tidak ada bubble). */
  bubble: string | null;
  /** Posisi layar, fraksi 0..1 dari ukuran Canvas (x dari kiri, y dari atas). */
  x: number;
  y: number;
  /** Status tag di BAWAH karakter (§18.3) — panel gelap + teks amber
      + badge LIVE. `live` false = tidak ada data live (OFFLINE). */
  statusTag?: {
    label: BotStateLabel;
    live: boolean;
    x: number;
    y: number;
  };
}

/** State bot untuk status tag (§18.3): KERJA / TIDUR / BUDGET HABIS / OFFLINE. */
export type BotStateLabel = 'KERJA' | 'TIDUR' | 'BUDGET HABIS' | 'OFFLINE';

/** Jendela segar beacon (sama seperti presence.ts, 120 dtk). */
export const BEACON_STALE_AFTER_SECONDS = 120;

/**
 * State bot untuk status tag di bawah karakter (§18.3), dari beacon
 * presence + gate cap — sumber yang sama seperti bubble 0.9.8.
 * - Tanpa beacon / tanpa data → OFFLINE (jangan pura-pura live).
 * - Cap habis (capAllowed === false, eksplisit dari /api/costs/cap-check)
 *   → BUDGET HABIS.
 * - Beacon active + segar → KERJA.
 * - Selain itu (idle, stopped, atau active yang sudah basi) → TIDUR.
 * capAllowed undefined = tidak ada data cap → jangan klaim BUDGET HABIS.
 */
export function botStateLabel(
  entry: { state: string; age_seconds?: number } | null | undefined,
  staleAfter: number = BEACON_STALE_AFTER_SECONDS,
  capAllowed?: boolean,
): BotStateLabel {
  if (!entry) return 'OFFLINE';
  if (capAllowed === false) return 'BUDGET HABIS';
  if (
    entry.state === 'active' &&
    typeof entry.age_seconds === 'number' &&
    entry.age_seconds <= staleAfter
  ) {
    return 'KERJA';
  }
  return 'TIDUR';
}

/**
 * Jangkar status tag: sedikit DI BAWAH pangkal karakter (kursi) supaya
 * tag tampil di bawah karakter di layar — bukan menutupi wajah.
 */
export function statusTagAnchorY(baseY: number): number {
  return baseY - 0.08;
}

/** Panjang maksimum nama di nameplate (nama lebih panjang dipendekkan). */
export const NAMEPLATE_MAX_CHARS = 16;
/** Panjang maksimum isi bubble (catatan tugas dari presence). */
export const BUBBLE_MAX_CHARS = 60;
/** Label bubble generik saat bot bekerja tapi tidak ada catatan tugas. */
export const BUBBLE_WORKING_LABEL = 'bekerja…';
/** Prefix bubble tugas selesai (§18.7: "Beres: Balas chat customer"). */
export const BERES_PREFIX = 'Beres: ';
/** "Beres:" tampil maks 5 menit setelah tugas selesai. */
export const BERES_TTL_MS = 5 * 60 * 1000;

/**
 * Nama pendek untuk nameplate: nama utuh bila muat, bila tidak kata
 * pertama; kata pertama yang masih terlalu panjang dipotong + "…".
 */
export function shortName(name: string): string {
  const clean = (name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Bot';
  if (clean.length <= NAMEPLATE_MAX_CHARS) return clean;
  const [first] = clean.split(' ');
  if (first.length <= NAMEPLATE_MAX_CHARS) return first;
  return `${first.slice(0, NAMEPLATE_MAX_CHARS - 1)}…`;
}

/** Potong teks ke `max` karakter (tambah "…" bila dipotong). */
export function truncateText(text: string, max: number): string {
  const clean = (text || '').trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Isi speech bubble satu bot (§18.7: bubble = TUGAS LIVE).
 * - Bekerja + ada catatan tugas (note dari beacon presence) → catatan
 *   itu, dipotong pendek. Catatan adalah klaim bot tentang dirinya
 *   sendiri (bukan data karangan).
 * - Bekerja + tanpa catatan → label generik "bekerja…" (jujur: bot
 *   memang bekerja menurut presence, tanpa mengarang tugas).
 * - Diam + ada tugas yang baru selesai (`beresTask`) → "Beres: <tugas>".
 * - Diam tanpa tugas selesai → tidak ada bubble (null).
 */
export function bubbleText(
  note: string | null | undefined,
  working: boolean,
  beresTask?: string | null,
): string | null {
  if (working) {
    const clean = (note || '').trim();
    if (clean) return truncateText(clean, BUBBLE_MAX_CHARS);
    return BUBBLE_WORKING_LABEL;
  }
  const done = (beresTask || '').trim();
  if (done) return truncateText(`${BERES_PREFIX}${done}`, BUBBLE_MAX_CHARS);
  return null;
}

/** Satu tugas yang baru selesai ("Beres:") + kapan selesainya. */
export interface BeresEntry {
  task: string;
  completedAt: number;
}

/**
 * Hitung peta "Beres:" berikutnya dari snapshot presence terbaru
 * (murni — DeckScreen menyimpan hasilnya di state).
 *
 * `prev` = peta sebelumnya; `prevWorking` = {botId: sedangKerja} di
 * poll SEBELUMNYA; `working` = yang terbaru; `tasks` = {botId: tugas
 * terakhir yang dikenal (note terakhir non-kosong — diingat client,
 * karena beacon bisa mengosongkan note saat bot diam)}; `now` =
 * Date.now().
 *
 * - Bot bekerja (lagi) → entrinya dihapus (tugas berikutnya dimulai).
 * - Bot diam + entri masih segar (< 5 menit) → dipertahankan.
 * - Bot diam + TIDAK ada entri + SEBELUMNYA bekerja + ada tugas
 *   terakhir → entri baru (completedAt = now). Transisi kerja→diam
 *   HARUS terlihat (prevWorking true) — bot yang dari awal sudah
 *   diam tidak langsung diklaim "Beres" (tugasnya belum terlihat
 *   dikerjakan).
 * - Entri lebih tua dari BERES_TTL_MS → dibuang.
 *
 * Batas yang dicatat: server TIDAK menyediakan field tugas-selesai —
 * "Beres" disimpulkan client-side dari transisi working→idle. Bila
 * transisi terjadi saat aplikasi tertutup / di luar jendela poll
 * (10 dtk), "Beres" tidak muncul.
 */
export function updateBeresTasks(
  prev: Record<string, BeresEntry>,
  prevWorking: Record<string, boolean>,
  working: Record<string, boolean>,
  tasks: Record<string, string>,
  now: number,
): Record<string, BeresEntry> {
  const out: Record<string, BeresEntry> = {};
  const ids = new Set([
    ...Object.keys(prev),
    ...Object.keys(prevWorking),
    ...Object.keys(working),
    ...Object.keys(tasks),
  ]);
  for (const id of ids) {
    if (working[id]) continue; // tugas berjalan (lagi) → bukan "Beres"
    const existing = prev[id];
    if (existing) {
      if (now - existing.completedAt < BERES_TTL_MS) out[id] = existing;
      continue;
    }
    if (!prevWorking[id]) continue; // tidak melihat transisi kerja→diam
    const task = (tasks[id] || '').trim();
    if (task) out[id] = { task, completedAt: now };
  }
  return out;
}

/**
 * Tinggi jangkar nameplate di atas kepala karakter: dasar + tinggi
 * kepala (dari pangkal karakter ke puncak kepala) + jarak 0.16.
 * `headHeight` default 0.94 = tinggi profil lathe blob hantu (semua
 * varian); karakter artikulasi 0.9.10 sudah dihapus di 0.9.11.
 */
export function nameplateAnchorY(baseY: number, scale: number, headHeight: number = 0.94): number {
  return baseY + headHeight * scale + 0.16;
}

/** Tinggi profil lathe blob hantu (semua varian 0.94 — untuk jangkar nameplate). */
export const GHOST_PROFILE_HEIGHT = 0.94;
/**
 * Skala blob di kursi meja (0.10.0: 2.0 — TERNYATA TIDAK TERLIHAT:
 * bukan cuma kecil, tapi posisinya salah, lihat DESK_GHOST_LOCAL_Z).
 * 0.10.1: 3.2 — KEGEDAN (Sam 18:15: "gde bgd bro", raksasa menutupi
 * kantor; puncak 3.48 nyaris menyentuh dinding 3.5; terukur emulator
 * 238px = 34% tinggi ruang).
 * 0.10.2-lama: 2.6 — MASIH KEGEDAN kata Sam (18:45), walau terukur
 * 192px = 27% ruang, monitor sudah mengintip.
 * 0.10.2-tengah: 2.3 — terukur emulator 169px (9,0% layar, rasio
 * vs meja 1,54×, puncak 2,63, mata/senyum/nameplate terbaca, tidak
 * menutupi meja lain) — lolos semua kriteria ukur lama, TAPI secara
 * visual MASIH blob besar yang menjulang 1,28 unit di atas monitor
 * (puncak 2,63 vs monitor 1,35): bukan "kepala di atas meja, badan
 * di belakang meja" seperti patokan Sam 18:49 ("AI Virtual Office":
 * karakter KECIL duduk di meja kerja, mengetik).
 * 0.10.2-final: 1.5 — kepala + bahu di atas garis meja, badan di
 * belakang meja: puncak 0,47 + 0,94×1,5 = 1,88 (hanya 0,53 di atas
 * monitor 1,35); di emulator ≈ 110px (rasio vs meja ≈ 1,0×); di
 * layar HP referensi ≈ 36px (vertikal murni, +kedalaman ≈ 41px);
 * mata 0,12×1,5 = 0,18 unit ≈ 12px di emulator, tetap terbaca.
 * (Patokan lama "1,5–2× meja" dari revisi 0.10.2 diganti patokan
 * referensi Sam — band itu yang bikin ghost terus kegedean.)
 */
export const GHOST_DESK_SCALE = 1.5;
/** Skala blob di beanbag (0.10.0: 1.6 → 0.10.1: 2.7 → 0.10.2-lama: 2.2 → 0.10.2-tengah: 1.9 → 0.10.2-final: 1.3, rasio sama terhadap meja). */
export const GHOST_BEANBAG_SCALE = 1.3;
/**
 * Offset lokal z blob di dalam grup DeskSpot (0.10.1).
 *
 * BUG 0.10.0: DeskSpot menaruh blob di lokal z = `z + 0.75` — padahal
 * grup DeskSpot sendiri SUDAH di posisi `[x, 0, z]`, jadi z dunia
 * blob = 2z + 0.75. Meja belakang (z=-2.3) → blob di z=-3.85, DI
 * BELAKANG dinding (z=-3): hanya selapis tipis yang kelihatan lewat
 * jendela (terukur di emulator: 17×51px, bukan di kursi). Meja depan
 * (z=0.7) → blob melayang di z=2.15, 1.4 unit di depan kursinya.
 * Nameplate TIDAK kena bug ini (pakai seatGhostPosition di bawah) —
 * itu kenapa nameplate dan badan tidak pernah sejajar.
 *
 * Nilai yang benar: lokal 0.75 (sisi kamera meja), sehingga z dunia
 * = z meja + 0.75 = posisi yang dipakai nameplate.
 */
export const DESK_GHOST_LOCAL_Z = 0.75;
/** Pangkal blob di kursi meja (dipakai nameplate + posisi jalan). */
export const DESK_BASE_Y = 0.47;
/** Pangkal blob di beanbag. */
export const BEANBAG_BASE_Y = 0.52;

/**
 * Posisi lantai karakter di satu kursi (x, z): meja → di depan meja
 * (sisi kamera, z + 0.75); beanbag → titik duduknya. SATU-SATUNYA
 * sumber kebenaran posisi karakter — dipakai nameplate
 * (OfficeScene) DAN harus cocok dengan penempatan blob di DeskSpot
 * (grup meja di `[x, 0, z]` + lokal z DESK_GHOST_LOCAL_Z).
 */
export function seatGhostPosition(spot: { kind: 'desk' | 'beanbag'; x: number; z: number }): {
  x: number;
  z: number;
} {
  if (spot.kind === 'beanbag') return { x: 0.2, z: 2.3 };
  return { x: spot.x, z: spot.z + DESK_GHOST_LOCAL_Z };
}
/** Ketinggian mata di profil (wajah di atas garis monitor meja). */
export const GHOST_EYE_Y = 0.62;
/** Ketinggian mulut di profil. */
export const GHOST_MOUTH_Y = 0.42;

/**
 * Zoom kamera orthographic di OfficeScene (CameraRig) dari ukuran
 * Canvas: `min(lebar/13, tinggi/8)`, dijepit 20..80. Murni — dipakai
 * tes visibilitas supaya angka zoom tidak ditebak dua kali.
 */
export function cameraZoomFor(canvasWidth: number, canvasHeight: number): number {
  return Math.max(20, Math.min(80, Math.min(canvasWidth / 13, canvasHeight / 8)));
}

/**
 * Faktor proyeksi vertikal kamera isometrik: kamera di (10,10,10)
 * melihat (0,0.9,0) — arah pandang ternormalisasi ≈
 * (-0.595,-0.541,-0.595); sumbu vertikal dunia (0,1,0) yang tegak
 * lurus arah pandang = sqrt(1 - 0.541²) ≈ 0.841. Jadi ruas vertikal
 * setinggi `h` unit dunia tampil setinggi `h × zoom × 0.841` piksel.
 */
export const ISO_VERTICAL_FACTOR = 0.841;

/**
 * Tinggi karakter di layar (piksel) dari tinggi dunianya. Dipakai
 * tes visibilitas 0.10.0: blob HARUS cukup besar di layar HP
 * referensi — pelajaran 0.9.10 (chibi lolos unit test tapi tidak
 * terlihat di screenshot Sam).
 */
export function projectedPxHeight(
  worldHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  return worldHeight * cameraZoomFor(canvasWidth, canvasHeight) * ISO_VERTICAL_FACTOR;
}

/**
 * Angkat jangkar nameplate sedikit per nomor kursi (selang-seling
 * 0 / 0.05) supaya nameplate dua kursi yang proyeksinya berdekatan
 * tidak bertumpuk persis di garis yang sama.
 */
export function nameplateLift(seatIndex: number): number {
  return seatIndex % 2 === 0 ? 0 : 0.05;
}

/**
 * Radius siluet lathe pada ketinggian `y`, dari profil titik-titik
 * (x = radius, y = tinggi). Interpolasi linear antar titik; di luar
 * rentang pakai titik ujung terdekat. Dipakai Ghost3D untuk
 * menempatkan mulut tepat di permukaan kubah (tiap varian beda lebar).
 */
export function radiusAt(points: readonly { x: number; y: number }[], y: number): number {
  if (points.length === 0) return 0;
  if (y <= points[0].y) return points[0].x;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (y <= b.y) {
      if (b.y === a.y) return b.x;
      const t = (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  return points[points.length - 1].x;
}

/**
 * Proyeksikan satu titik 3D ke fraksi layar (0..1, x dari kiri,
 * y dari atas). `project` adalah proyeksi kamera (mis. dari
 * `new THREE.Vector3(x, y, z).project(camera)`); mengembalikan null
 * bila titik di belakang kamera (ndc.z > 1).
 */
export function projectAnchor(
  anchor: { x: number; y: number; z: number },
  project: (x: number, y: number, z: number) => { x: number; y: number; z: number },
): { x: number; y: number } | null {
  const ndc = project(anchor.x, anchor.y, anchor.z);
  if (ndc.z > 1 || ndc.z < -1) return null;
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2 };
}
