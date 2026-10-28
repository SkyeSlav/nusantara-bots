/**
 * Tool pembuat skill untuk chat BYO (0.10.10 — skill creator).
 *
 * Akar masalah (permintaan Sam 27 Okt 13:31): Xman menjawab "saya
 * gagal bikin skill" karena TIDAK ADA tool untuk membuat skill —
 * model tidak punya jalan untuk menulis SKILL.md ke rak skill.
 *
 * Perbaikan (pola Hermes, disesuaikan ke grokbot): beri model tool
 * NYATA — `create_skill` (POST /api/skills: model menulis SKILL.md
 * baru, server MEMVALIDASI dulu — frontmatter wajib, deskripsi
 * <1024 karakter, tanpa kata promosi — baru menulis ke rak),
 * `list_skills` (GET /api/skills: skill yang benar-benar ada di
 * rak) dan `assign_skill` (POST /api/characters/:id/skills: pasang
 * skill ke bot lain — hanya daftar `skills:` di file bot yang
 * ditulis ulang, validasi rak tetap berlaku).
 *
 * Sisi aplikasi ini TIDAK mengarang apa pun: hasil tool adalah
 * respons server apa adanya (sukses / ditolak validasi / sudah
 * ada). Bila server menolak, model diberi tahu alasan persisnya —
 * bukan dibiarkan mengarang keberhasilan. Skill TIDAK PERNAH
 * membawa kunci/kredensial (BYO-API by design: skill hanya
 * mendeklarasikan kebutuhan, bukan nilai kunci).
 *
 * Catatan 0.10.8 (pelajaran DSML): relay2 + wrapper MEMBUANG tool
 * invoke TANPA argumen (0 call) — jadi `list_skills` punya argumen
 * WAJIB `scope` (nilai "shelf"), seperti `browser_list_elements`
 * yang scope-nya wajib. Model JANGAN PERNAH memanggil list_skills
 * tanpa argumen.
 */

import { ApiError } from './types';
import type { SkillInfo } from './types';
import { assignSkill, createSkill, getSkills } from './client';
import type { ChatTool, ParsedToolCall } from './byo';

export const CREATE_SKILL_TOOL_NAME = 'create_skill';
export const LIST_SKILLS_TOOL_NAME = 'list_skills';
export const ASSIGN_SKILL_TOOL_NAME = 'assign_skill';

/** Nama skill: huruf-kecil-dipisah-tanda-hubung (aturan server). */
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Batas argumen create_skill (sama dengan batas server). */
export const CREATE_SKILL_MAX_NAME_LENGTH = 40;
export const CREATE_SKILL_MAX_DESCRIPTION_LENGTH = 1024;
export const CREATE_SKILL_MAX_BODY_LENGTH = 60000;
export const CREATE_SKILL_MAX_TAGS = 10;
export const CREATE_SKILL_MAX_TAG_LENGTH = 30;

/** Batas argumen assign_skill. */
export const ASSIGN_SKILL_MAX_BOT_ID_LENGTH = 40;
export const ASSIGN_SKILL_MAX_SKILL_LENGTH = 40;

/**
 * Tool `create_skill`: tulis satu skill baru ke rak skill-pack.
 * Server memvalidasi dulu (frontmatter wajib, deskripsi satu
 * kalimat tanpa kata promosi, isi tidak kosong, tanpa kredensial)
 * — skill yang ditolak TIDAK PERNAH tertulis ke rak. Satu
 * panggilan per skill.
 */
export const CREATE_SKILL_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: CREATE_SKILL_TOOL_NAME,
    description:
      'Buat satu skill baru di rak skill (server). Skill yang dibuat BENAR-BENAR ' +
      'ada di rak — pakai tool ini setiap kali pengguna meminta membuat skill baru, ' +
      'satu panggilan per skill. Server memvalidasi dulu: nama huruf-kecil-dipisah-' +
      'tanda-hubung, deskripsi satu kalimat tanpa kata promosi, isi berupa ' +
      'langkah-langkah konkret, dan TIDAK BOLEH berisi kunci/API key/password. ' +
      'Jangan pernah mengklaim skill sudah dibuat tanpa memanggil tool ini dulu.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nama skill (wajib, huruf-kecil-dipisah-tanda-hubung, contoh: "meeting-notes").',
        },
        description: {
          type: 'string',
          description:
            'Deskripsi skill dalam SATU kalimat (wajib, maks 1024 karakter): apa yang dilakukan skill itu. ' +
            'Jangan pakai kata promosi seperti powerful, comprehensive, seamless, advanced, cutting-edge, ' +
            'state-of-the-art, revolutionary, atau robust — server menolaknya.',
        },
        body: {
          type: 'string',
          description:
            'Isi skill (wajib): instruksi langkah-demi-langkah yang jelas dan praktis. ' +
            'Jangan menulis kunci, API key, password, atau token apa pun di sini.',
        },
        category: {
          type: 'string',
          description: 'Kategori skill (opsional, contoh: "writing").',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag skill (opsional, maks 10).',
        },
      },
      required: ['name', 'description', 'body'],
      additionalProperties: false,
    },
  },
};

/**
 * Tool `list_skills`: daftar skill yang BENAR-BENAR ada di rak.
 * Panggil tool ini SEBELUM membuat skill baru — bila skill yang
 * diminta sudah ada, pakai itu, jangan membuat duplikat. Argumen
 * `scope` WAJIB diisi "shelf" (tanpa argumen, panggilan tool bisa
 * hilang di jalan — pelajaran 0.10.8).
 */
export const LIST_SKILLS_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: LIST_SKILLS_TOOL_NAME,
    description:
      'Lihat daftar skill yang benar-benar ada di rak skill saat ini (nama, deskripsi, versi). ' +
      'Panggil tool ini sebelum membuat skill baru (cek duplikat dulu) dan sebelum memasang skill ke bot. ' +
      'Wajib panggil dengan argumen {"scope": "shelf"} — JANGAN panggil tanpa argumen.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Wajib diisi "shelf" (satu-satunya nilai yang diterima).',
        },
      },
      required: ['scope'],
      additionalProperties: false,
    },
  },
};

/**
 * Tool `assign_skill`: pasang satu skill dari rak ke bot lain.
 * Skill harus sudah ada di rak (cek dulu dengan list_skills) dan
 * bot target harus ada (cek dulu dengan list_bots).
 */
export const ASSIGN_SKILL_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: ASSIGN_SKILL_TOOL_NAME,
    description:
      'Pasang satu skill dari rak ke bot lain (atau lepas dengan action "remove"). ' +
      'Skill harus sudah ada di rak — cek dulu dengan list_skills; bot target harus ada — ' +
      'cek dulu dengan list_bots. Jangan pernah mengklaim skill sudah dipasang tanpa ' +
      'memanggil tool ini dulu.',
    parameters: {
      type: 'object',
      properties: {
        bot_id: {
          type: 'string',
          description: 'Id bot target (wajib, contoh: "budi" — lihat list_bots).',
        },
        skill: {
          type: 'string',
          description: 'Nama skill dari rak (wajib, contoh: "meeting-notes" — lihat list_skills).',
        },
        action: {
          type: 'string',
          description: '"assign" untuk memasang (default), "remove" untuk melepas skill dari bot.',
        },
      },
      required: ['bot_id', 'skill'],
      additionalProperties: false,
    },
  },
};

/** Semua tool pembuat skill (untuk ChatScreen). */
export const SKILL_TOOLS: ChatTool[] = [CREATE_SKILL_TOOL, LIST_SKILLS_TOOL, ASSIGN_SKILL_TOOL];

export type CreateSkillArgs =
  | {
      ok: true;
      name: string;
      description: string;
      body: string;
      category?: string;
      tags?: string[];
    }
  | { ok: false; error: string };

export type AssignSkillArgs =
  | { ok: true; botId: string; skill: string; action: 'assign' | 'remove' }
  | { ok: false; error: string };

/** Validasi argumen create_skill dari model (jangan kirim sampah ke server). */
export function validateCreateSkillArgs(args: unknown): CreateSkillArgs {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, error: 'Argumen create_skill harus berupa objek dengan name, description, dan body.' };
  }
  const raw = args as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return { ok: false, error: 'Nama skill kosong — berikan name yang valid.' };
  }
  if (name.length > CREATE_SKILL_MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Nama skill terlalu panjang (${name.length} karakter, maks ${CREATE_SKILL_MAX_NAME_LENGTH}).`,
    };
  }
  if (!SKILL_NAME_RE.test(name)) {
    return {
      ok: false,
      error: `Nama skill "${name}" harus huruf-kecil-dipisah-tanda-hubung (contoh: "meeting-notes").`,
    };
  }
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!description) {
    return { ok: false, error: 'Deskripsi skill kosong — berikan satu kalimat tentang apa yang dilakukan skill itu.' };
  }
  if (description.length > CREATE_SKILL_MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Deskripsi skill terlalu panjang (${description.length} karakter, maks ${CREATE_SKILL_MAX_DESCRIPTION_LENGTH}).`,
    };
  }
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) {
    return { ok: false, error: 'Isi skill kosong — berikan langkah-langkah konkret skill itu.' };
  }
  if (body.length > CREATE_SKILL_MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: `Isi skill terlalu panjang (${body.length} karakter, maks ${CREATE_SKILL_MAX_BODY_LENGTH}).`,
    };
  }
  let category: string | undefined;
  if (raw.category !== undefined) {
    if (typeof raw.category !== 'string') {
      return { ok: false, error: 'Category harus berupa teks.' };
    }
    category = raw.category.trim() || undefined;
  }
  let tags: string[] | undefined;
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags)) {
      return { ok: false, error: 'Tags harus berupa daftar teks.' };
    }
    const cleaned = raw.tags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, CREATE_SKILL_MAX_TAGS);
    for (const t of cleaned) {
      if (t.length > CREATE_SKILL_MAX_TAG_LENGTH) {
        return {
          ok: false,
          error: `Tag "${t}" terlalu panjang (maks ${CREATE_SKILL_MAX_TAG_LENGTH} karakter).`,
        };
      }
    }
    if (cleaned.length > 0) tags = cleaned;
  }
  return { ok: true, name, description, body, category, tags };
}

/** Validasi argumen assign_skill dari model. */
export function validateAssignSkillArgs(args: unknown): AssignSkillArgs {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, error: 'Argumen assign_skill harus berupa objek dengan bot_id dan skill.' };
  }
  const raw = args as Record<string, unknown>;
  const botId = typeof raw.bot_id === 'string' ? raw.bot_id.trim() : '';
  if (!botId) {
    return { ok: false, error: 'bot_id kosong — berikan id bot target (lihat list_bots).' };
  }
  if (botId.length > ASSIGN_SKILL_MAX_BOT_ID_LENGTH) {
    return {
      ok: false,
      error: `bot_id terlalu panjang (${botId.length} karakter, maks ${ASSIGN_SKILL_MAX_BOT_ID_LENGTH}).`,
    };
  }
  const skill = typeof raw.skill === 'string' ? raw.skill.trim() : '';
  if (!skill) {
    return { ok: false, error: 'Skill kosong — berikan nama skill dari rak (lihat list_skills).' };
  }
  if (skill.length > ASSIGN_SKILL_MAX_SKILL_LENGTH) {
    return {
      ok: false,
      error: `Nama skill terlalu panjang (${skill.length} karakter, maks ${ASSIGN_SKILL_MAX_SKILL_LENGTH}).`,
    };
  }
  if (!SKILL_NAME_RE.test(skill)) {
    return {
      ok: false,
      error: `Nama skill "${skill}" harus huruf-kecil-dipisah-tanda-hubung.`,
    };
  }
  let action: 'assign' | 'remove' = 'assign';
  if (raw.action !== undefined) {
    if (raw.action !== 'assign' && raw.action !== 'remove') {
      return { ok: false, error: 'Action harus "assign" atau "remove".' };
    }
    action = raw.action;
  }
  return { ok: true, botId, skill, action };
}

/**
 * Eksekutor tool create_skill. TIDAK PERNAH throw — semua kegagalan
 * dikembalikan sebagai teks hasil tool supaya model melapor jujur.
 * Pesan penolakan server (mis. kata promosi, nama duplikat)
 * diteruskan apa adanya supaya model bisa memperbaiki.
 */
export async function executeCreateSkillTool(call: ParsedToolCall): Promise<string> {
  if (call.name !== CREATE_SKILL_TOOL_NAME) {
    return 'Tool itu tidak dikenal di aplikasi ini.';
  }
  if (!call.argsValid) {
    return 'Argumen create_skill tidak valid (bukan JSON objek). Berikan name, description, dan body sebagai string.';
  }
  const checked = validateCreateSkillArgs(call.args);
  if (!checked.ok) {
    return `Skill tidak dibuat: ${checked.error}`;
  }
  let created: { skill: SkillInfo; warnings: string[] } | null;
  try {
    created = await createSkill({
      name: checked.name,
      description: checked.description,
      body: checked.body,
      category: checked.category,
      tags: checked.tags,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      return `Skill "${checked.name}" tidak dibuat: sudah ada skill dengan nama itu di rak. Pakai nama lain, atau cek dulu dengan list_skills.`;
    }
    return `Skill "${checked.name}" tidak dibuat: server menolak (${e instanceof Error ? e.message : 'error tak dikenal'}). Beri tahu pengguna alasan persisnya dan tawarkan perbaikan — jangan mengklaim skill sudah jadi.`;
  }
  if (!created) {
    return `Skill "${checked.name}" tidak dibuat: server meminta token. Beri tahu pengguna dengan jujur dan jangan mengklaim skill sudah jadi.`;
  }
  const warnings = (created.warnings || []).filter(Boolean);
  const warningNote = warnings.length > 0 ? ` Catatan server: ${warnings.join(' ')}` : '';
  return (
    `Skill dibuat: ${created.skill.name} (v${created.skill.version}) — ${created.skill.description}` +
    warningNote
  );
}

/**
 * Eksekutor tool list_skills. TIDAK PERNAH throw — kegagalan membaca
 * rak dikembalikan sebagai teks jujur (bukan daftar karangan).
 */
export async function executeListSkillsTool(call: ParsedToolCall): Promise<string> {
  if (call.name !== LIST_SKILLS_TOOL_NAME) {
    return 'Tool itu tidak dikenal di aplikasi ini.';
  }
  let skills: SkillInfo[] | null;
  try {
    skills = await getSkills();
  } catch {
    return 'Tidak bisa membaca rak skill: server tidak menjawab. Jangan mengklaim skill apa pun — beri tahu pengguna server tidak terjangkau.';
  }
  if (!skills) {
    return 'Tidak bisa membaca rak skill: server meminta token. Jangan mengklaim skill apa pun.';
  }
  if (skills.length === 0) {
    return 'Rak skill masih kosong — belum ada skill. Jangan mengklaim ada skill yang sudah dibuat.';
  }
  const lines = skills.map((s) => `• ${s.name} (v${s.version}, ${s.status}) — ${s.description}`);
  return `Skill di rak (${skills.length}):\n${lines.join('\n')}`;
}

/**
 * Eksekutor tool assign_skill. TIDAK PERNAH throw — kegagalan
 * dikembalikan sebagai teks hasil tool supaya model melapor jujur.
 */
export async function executeAssignSkillTool(call: ParsedToolCall): Promise<string> {
  if (call.name !== ASSIGN_SKILL_TOOL_NAME) {
    return 'Tool itu tidak dikenal di aplikasi ini.';
  }
  if (!call.argsValid) {
    return 'Argumen assign_skill tidak valid (bukan JSON objek). Berikan bot_id dan skill sebagai string.';
  }
  const checked = validateAssignSkillArgs(call.args);
  if (!checked.ok) {
    return `Skill tidak dipasang: ${checked.error}`;
  }
  let result: { character: { name: string; skills: string[] }; changed: boolean; note: string } | null;
  try {
    result = await assignSkill(checked.botId, checked.skill, checked.action);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return `Skill tidak dipasang: bot "${checked.botId}" tidak ada. Cek dulu dengan list_bots.`;
    }
    return `Skill tidak dipasang: server menolak (${e instanceof Error ? e.message : 'error tak dikenal'}). Beri tahu pengguna alasan persisnya — jangan mengklaim skill sudah dipasang.`;
  }
  if (!result) {
    return 'Skill tidak dipasang: server meminta token. Beri tahu pengguna dengan jujur dan jangan mengklaim skill sudah dipasang.';
  }
  const verb = checked.action === 'remove' ? 'dilepas dari' : 'dipasang ke';
  const already = !result.changed
    ? checked.action === 'remove'
      ? ` (bot itu memang belum punya skill "${checked.skill}")`
      : ` (bot itu sudah punya skill "${checked.skill}")`
    : '';
  return (
    `Skill "${checked.skill}" ${verb} bot ${result.character.name} (${result.character.skills.join(', ') || 'tanpa skill'}).` +
    already
  );
}

/**
 * Dispatcher tool pembuat skill untuk tool loop BYO. TIDAK PERNAH
 * throw — semua kegagalan dikembalikan sebagai teks hasil tool.
 */
export async function executeSkillTool(call: ParsedToolCall): Promise<string> {
  if (call.name === CREATE_SKILL_TOOL_NAME) return executeCreateSkillTool(call);
  if (call.name === LIST_SKILLS_TOOL_NAME) return executeListSkillsTool(call);
  if (call.name === ASSIGN_SKILL_TOOL_NAME) return executeAssignSkillTool(call);
  return 'Tool itu tidak dikenal di aplikasi ini.';
}
