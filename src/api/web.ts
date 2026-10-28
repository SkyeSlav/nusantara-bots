/**
 * Web browsing untuk chat (0.9.7, permintaan Sam: bot bisa memakai
 * kemampuan browser).
 *
 * Tiga endpoint server (spesifikasi lengkap di
 * BUILD-0.9.7-HANDOFF.md — parent mengimplementasikannya di PC):
 *   POST /api/web/search  {q}   -> {results: [{title, url, snippet}]}
 *   POST /api/web/fetch   {url} -> {url, title, text}   (anonim)
 *   POST /api/web/browse  {url} -> {url, title, text}   (login, lewat
 *       browser asli PC — Firefox via browsermcp, membawa sesi login
 *       user; dipakai saat pesan berisi URL dan toggle Web ON)
 *
 * Semua fungsi jaringan di sini TIDAK PERNAH throw ke UI — gagal =
 * null, chat jalan normal tanpa konteks web. Tidak ada kredensial
 * apa pun yang dikirim ke endpoint ini (hanya query / URL).
 */

import { apiFetch } from './client';

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebPage {
  url: string;
  title: string;
  text: string;
}

interface SearchResponse {
  results?: unknown;
}

interface PageResponse {
  url?: unknown;
  title?: unknown;
  text?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseResults(data: unknown): WebResult[] | null {
  if (!isRecord(data) || !Array.isArray(data.results)) return null;
  const out: WebResult[] = [];
  for (const r of data.results) {
    if (!isRecord(r)) continue;
    out.push({ title: asString(r.title), url: asString(r.url), snippet: asString(r.snippet) });
  }
  return out;
}

function parsePage(data: unknown): WebPage | null {
  if (!isRecord(data)) return null;
  const url = asString(data.url);
  if (!url) return null;
  return { url, title: asString(data.title), text: asString(data.text) };
}

async function postWeb(path: string, body: Record<string, unknown>): Promise<unknown | null> {
  try {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    try {
      return (await res.json()) as unknown;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * POST /api/web/search {q} — hasil pencarian web (top ~5).
 * Null pada kegagalan apa pun (401, 500, jaringan, body rusak).
 */
export async function searchWeb(q: string): Promise<WebResult[] | null> {
  const query = q.trim();
  if (!query) return null;
  const data = await postWeb('/api/web/search', { q: query });
  return parseResults(data);
}

/**
 * POST /api/web/fetch {url} — isi halaman, diambil anonim
 * (HTTP biasa, tanpa cookie/login).
 * Null pada kegagalan apa pun.
 */
export async function fetchPage(url: string): Promise<WebPage | null> {
  const target = url.trim();
  if (!target) return null;
  const data = await postWeb('/api/web/fetch', { url: target });
  return parsePage(data);
}

/**
 * POST /api/web/browse {url} — isi halaman, dibuka lewat browser
 * ASLI PC (Firefox via browsermcp) sehingga situs yang user-nya
 * sudah login (YouTube Studio, Gmail, dashboard) bisa dibaca dan
 * dianalisa bot. Tanpa kredensial tersimpan — memakai sesi live
 * browser di PC saja. Null pada kegagalan apa pun.
 */
export async function browsePage(url: string): Promise<WebPage | null> {
  const target = url.trim();
  if (!target) return null;
  const data = await postWeb('/api/web/browse', { url: target });
  return parsePage(data);
}

/** Format blok konteks hasil pencarian — persis seperti spesifikasi. */
export function buildWebContext(results: WebResult[]): string {
  const lines = results.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`);
  return [
    '[Hasil pencarian web — gunakan info ini untuk menjawab]',
    ...lines,
    '[Akhir hasil pencarian]',
  ].join('\n');
}

/**
 * Prompt model saat toggle Web ON dan pesan bukan URL: konteks
 * pencarian + pesan asli. Tanpa hasil (null/kosong) = pesan asli
 * tanpa perubahan.
 */
export function buildWebPrompt(userText: string, results: WebResult[] | null): string {
  if (!results || results.length === 0) return userText;
  return `${buildWebContext(results)}\n\n${userText}`;
}

/** Format blok konteks isi satu halaman web. */
export function buildPageContext(page: WebPage): string {
  return [
    '[Isi halaman web — gunakan info ini untuk menjawab]',
    `Judul: ${page.title}`,
    `URL: ${page.url}`,
    page.text,
    '[Akhir isi halaman]',
  ].join('\n');
}

/**
 * Prompt model saat toggle Web ON dan pesan berisi URL: isi halaman
 * (dibuka lewat browsePage, sesi login) + pesan asli. Tanpa halaman
 * (null) = pesan asli tanpa perubahan.
 */
export function buildPagePrompt(userText: string, page: WebPage | null): string {
  if (!page) return userText;
  return `${buildPageContext(page)}\n\n${userText}`;
}

/** Ambil semua URL http(s) dari teks. Tanda baca di akhir dibuang. */
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s]+/g) ?? [];
  return found.map((u) => u.replace(/[.,;:!?)\]}'"]+$/, ''));
}

export interface LinkSegment {
  text: string;
  /** true bila segmen ini URL yang bisa dibuka di browser. */
  url: boolean;
}

/**
 * Pecah teks jadi segmen teks-biasa / URL — dipakai ChatScreen untuk
 * menampilkan URL sebagai link yang bisa ditekan. Murni.
 */
export function splitLinkSegments(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  const re = /https?:\/\/[^\s]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const clean = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    const trailing = raw.slice(clean.length);
    if (m.index > last) {
      segments.push({ text: text.slice(last, m.index), url: false });
    }
    if (clean) segments.push({ text: clean, url: true });
    if (trailing) segments.push({ text: trailing, url: false });
    last = m.index + raw.length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), url: false });
  }
  return segments.filter((s) => s.text.length > 0);
}
