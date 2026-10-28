/**
 * Tests untuk tool pembuat skill (skillTools.ts, 0.10.10).
 *
 * Aturan yang diuji: model HANYA boleh mengklaim skill dibuat /
 * dipasang bila tool mengembalikan sukses dari server — eksekutor
 * TIDAK PERNAH mengarang keberhasilan dan TIDAK PERNAH throw.
 * Penolakan validasi server (kata promosi, nama duplikat, skill
 * tak dikenal) diteruskan apa adanya supaya model bisa memperbaiki.
 */
import {
  ASSIGN_SKILL_TOOL,
  CREATE_SKILL_TOOL,
  LIST_SKILLS_TOOL,
  executeAssignSkillTool,
  executeCreateSkillTool,
  executeListSkillsTool,
  executeSkillTool,
  validateAssignSkillArgs,
  validateCreateSkillArgs,
} from '../skillTools';
import type { ParsedToolCall } from '../byo';

jest.mock('../client', () => ({
  createSkill: jest.fn(),
  getSkills: jest.fn(),
  assignSkill: jest.fn(),
}));

import { assignSkill, createSkill, getSkills } from '../client';
import { ApiError } from '../types';

const mockCreateSkill = createSkill as jest.Mock;
const mockGetSkills = getSkills as jest.Mock;
const mockAssignSkill = assignSkill as jest.Mock;

function call(name: string, args: unknown, argsValid = true): ParsedToolCall {
  return {
    id: 'call-1',
    name,
    args: args as Record<string, unknown>,
    argsRaw: JSON.stringify(args ?? {}),
    argsValid,
  };
}

const SKILL = {
  name: 'meeting-notes',
  description: 'Writes short meeting notes.',
  version: '1.0.0',
  status: 'valid',
  errors: [],
};

describe('CREATE_SKILL_TOOL / LIST_SKILLS_TOOL / ASSIGN_SKILL_TOOL', () => {
  it('mendefinisikan tiga tool dengan nama dan deskripsi jujur', () => {
    expect(CREATE_SKILL_TOOL.function.name).toBe('create_skill');
    expect(LIST_SKILLS_TOOL.function.name).toBe('list_skills');
    expect(ASSIGN_SKILL_TOOL.function.name).toBe('assign_skill');
    expect(CREATE_SKILL_TOOL.function.description).toContain('BENAR-BENAR ada');
    expect(CREATE_SKILL_TOOL.function.description).toContain('Jangan pernah mengklaim');
    expect(CREATE_SKILL_TOOL.function.description).toContain('TIDAK BOLEH berisi kunci');
    expect(LIST_SKILLS_TOOL.function.description).toContain('cek duplikat dulu');
    expect(ASSIGN_SKILL_TOOL.function.description).toContain('Jangan pernah mengklaim');
  });

  it('list_skills mewajibkan argumen scope (pelajaran DSML 0.10.8)', () => {
    const params = LIST_SKILLS_TOOL.function.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(params.required).toContain('scope');
    expect(params.properties?.scope).toBeDefined();
  });
});

describe('validateCreateSkillArgs', () => {
  it('menerima nama + deskripsi + isi yang valid', () => {
    expect(
      validateCreateSkillArgs({
        name: 'meeting-notes',
        description: 'Writes short meeting notes.',
        body: 'Write notes after each meeting.',
      }),
    ).toEqual({
      ok: true,
      name: 'meeting-notes',
      description: 'Writes short meeting notes.',
      body: 'Write notes after each meeting.',
      category: undefined,
      tags: undefined,
    });
  });

  it('menerima category dan tags yang valid', () => {
    expect(
      validateCreateSkillArgs({
        name: 'meeting-notes',
        description: 'Writes short meeting notes.',
        body: 'Write notes.',
        category: 'writing',
        tags: ['notes', 'meeting'],
      }),
    ).toEqual({
      ok: true,
      name: 'meeting-notes',
      description: 'Writes short meeting notes.',
      body: 'Write notes.',
      category: 'writing',
      tags: ['notes', 'meeting'],
    });
  });

  it('menolak nama kosong, nama bukan huruf-kecil-tanda-hubung, deskripsi/isi kosong', () => {
    expect(validateCreateSkillArgs({ name: '', description: 'x', body: 'y' }).ok).toBe(false);
    expect(validateCreateSkillArgs({ name: 'Meeting Notes', description: 'x', body: 'y' }).ok).toBe(false);
    expect(validateCreateSkillArgs({ name: 'meeting-notes', description: '', body: 'y' }).ok).toBe(false);
    expect(validateCreateSkillArgs({ name: 'meeting-notes', description: 'x', body: '' }).ok).toBe(false);
  });

  it('menolak deskripsi >1024 dan isi >60000 karakter', () => {
    expect(
      validateCreateSkillArgs({ name: 'x', description: 'a'.repeat(1025), body: 'y' }).ok,
    ).toBe(false);
    expect(
      validateCreateSkillArgs({ name: 'x', description: 'ok', body: 'b'.repeat(60001) }).ok,
    ).toBe(false);
  });

  it('memotong tags ke maks 10 dan menolak tag terlalu panjang', () => {
    const many = validateCreateSkillArgs({
      name: 'x',
      description: 'ok',
      body: 'y',
      tags: Array.from({ length: 12 }, (_, i) => `t${i}`),
    });
    expect(many.ok).toBe(true);
    if (many.ok) expect(many.tags).toHaveLength(10);
    expect(
      validateCreateSkillArgs({ name: 'x', description: 'ok', body: 'y', tags: ['a'.repeat(31)] }).ok,
    ).toBe(false);
  });
});

describe('validateAssignSkillArgs', () => {
  it('menerima bot_id + skill, default action assign', () => {
    expect(validateAssignSkillArgs({ bot_id: 'budi', skill: 'meeting-notes' })).toEqual({
      ok: true,
      botId: 'budi',
      skill: 'meeting-notes',
      action: 'assign',
    });
  });

  it('menerima action remove', () => {
    expect(validateAssignSkillArgs({ bot_id: 'budi', skill: 'meeting-notes', action: 'remove' })).toEqual({
      ok: true,
      botId: 'budi',
      skill: 'meeting-notes',
      action: 'remove',
    });
  });

  it('menolak bot_id/skill kosong, nama skill tak valid, dan action tak dikenal', () => {
    expect(validateAssignSkillArgs({ bot_id: '', skill: 'meeting-notes' }).ok).toBe(false);
    expect(validateAssignSkillArgs({ bot_id: 'budi', skill: '' }).ok).toBe(false);
    expect(validateAssignSkillArgs({ bot_id: 'budi', skill: 'Meeting Notes' }).ok).toBe(false);
    expect(validateAssignSkillArgs({ bot_id: 'budi', skill: 'meeting-notes', action: 'delete' }).ok).toBe(false);
  });
});

describe('executeCreateSkillTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mengembalikan sukses server apa adanya (nama + versi), bukan karangan', async () => {
    mockCreateSkill.mockResolvedValue({ skill: SKILL, warnings: [] });
    const out = await executeCreateSkillTool(
      call('create_skill', { name: 'meeting-notes', description: 'Writes short meeting notes.', body: 'Write notes.' }),
    );
    expect(out).toContain('Skill dibuat: meeting-notes (v1.0.0)');
    expect(out).toContain('Writes short meeting notes.');
    expect(mockCreateSkill).toHaveBeenCalledWith({
      name: 'meeting-notes',
      description: 'Writes short meeting notes.',
      body: 'Write notes.',
      category: undefined,
      tags: undefined,
    });
  });

  it('meneruskan advisory warnings server ke hasil tool', async () => {
    mockCreateSkill.mockResolvedValue({
      skill: SKILL,
      warnings: ['body mentions raw shell utilit(ies): grep'],
    });
    const out = await executeCreateSkillTool(
      call('create_skill', { name: 'meeting-notes', description: 'Writes short meeting notes.', body: 'grep it.' }),
    );
    expect(out).toContain('Catatan server:');
    expect(out).toContain('grep');
  });

  it('melaporkan 409 sebagai "sudah ada" — bukan sukses palsu', async () => {
    mockCreateSkill.mockRejectedValue(new ApiError(409, "skill 'meeting-notes' already exists"));
    const out = await executeCreateSkillTool(
      call('create_skill', { name: 'meeting-notes', description: 'Writes short meeting notes.', body: 'Write notes.' }),
    );
    expect(out).toContain('sudah ada skill dengan nama itu');
    expect(out).not.toContain('Skill dibuat:');
  });

  it('melaporkan penolakan validasi server dengan alasan persisnya', async () => {
    mockCreateSkill.mockRejectedValue(
      new ApiError(400, 'description contains marketing word(s): revolutionary — rewrite plainly'),
    );
    const out = await executeCreateSkillTool(
      call('create_skill', { name: 'x', description: 'A revolutionary tool.', body: 'Do it.' }),
    );
    expect(out).toContain('revolutionary');
    expect(out).toContain('jangan mengklaim skill sudah jadi');
  });

  it('menolak argumen tidak valid tanpa memanggil server', async () => {
    const out = await executeCreateSkillTool(
      call('create_skill', { name: 'Bad Name!', description: 'x', body: 'y' }),
    );
    expect(out).toContain('Skill tidak dibuat:');
    expect(mockCreateSkill).not.toHaveBeenCalled();
  });

  it('menolak tool call yang args-nya bukan JSON valid', async () => {
    const out = await executeCreateSkillTool(call('create_skill', null, false));
    expect(out).toContain('Argumen create_skill tidak valid');
    expect(mockCreateSkill).not.toHaveBeenCalled();
  });
});

describe('executeListSkillsTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mengembalikan daftar skill yang benar-benar ada', async () => {
    mockGetSkills.mockResolvedValue([SKILL, { ...SKILL, name: 'threads-substance', version: '1.0.0' }]);
    const out = await executeListSkillsTool(call('list_skills', { scope: 'shelf' }));
    expect(out).toContain('Skill di rak (2):');
    expect(out).toContain('meeting-notes');
    expect(out).toContain('threads-substance');
  });

  it('jujur bila rak masih kosong — melarang klaim skill', async () => {
    mockGetSkills.mockResolvedValue([]);
    const out = await executeListSkillsTool(call('list_skills', { scope: 'shelf' }));
    expect(out).toContain('Rak skill masih kosong');
  });

  it('jujur bila server tidak menjawab — bukan daftar karangan', async () => {
    mockGetSkills.mockRejectedValue(new Error('network down'));
    const out = await executeListSkillsTool(call('list_skills', { scope: 'shelf' }));
    expect(out).toContain('Tidak bisa membaca rak skill');
    expect(out).toContain('Jangan mengklaim skill apa pun');
  });
});

describe('executeAssignSkillTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mengembalikan sukses server apa adanya (skill + daftar skill bot)', async () => {
    mockAssignSkill.mockResolvedValue({
      character: { name: 'Budi', skills: ['team-memory', 'meeting-notes'] },
      changed: true,
      note: "skill 'meeting-notes' assigned",
    });
    const out = await executeAssignSkillTool(
      call('assign_skill', { bot_id: 'budi', skill: 'meeting-notes' }),
    );
    expect(out).toContain('Skill "meeting-notes" dipasang ke bot Budi');
    expect(out).toContain('team-memory, meeting-notes');
    expect(mockAssignSkill).toHaveBeenCalledWith('budi', 'meeting-notes', 'assign');
  });

  it('melaporkan idempotent (sudah punya) tanpa mengklaim perubahan baru', async () => {
    mockAssignSkill.mockResolvedValue({
      character: { name: 'Budi', skills: ['team-memory', 'meeting-notes'] },
      changed: false,
      note: "bot already has skill 'meeting-notes'",
    });
    const out = await executeAssignSkillTool(
      call('assign_skill', { bot_id: 'budi', skill: 'meeting-notes' }),
    );
    expect(out).toContain('sudah punya skill "meeting-notes"');
  });

  it('melaporkan 404 sebagai bot tidak ada', async () => {
    mockAssignSkill.mockRejectedValue(new ApiError(404, "unknown character 'ghost'"));
    const out = await executeAssignSkillTool(
      call('assign_skill', { bot_id: 'ghost', skill: 'meeting-notes' }),
    );
    expect(out).toContain('bot "ghost" tidak ada');
  });

  it('melaporkan skill tak dikenal dengan alasan server', async () => {
    mockAssignSkill.mockRejectedValue(new ApiError(400, "unknown skill 'no-such-skill' — known skills: meeting-notes"));
    const out = await executeAssignSkillTool(
      call('assign_skill', { bot_id: 'budi', skill: 'no-such-skill' }),
    );
    expect(out).toContain('no-such-skill');
    expect(out).toContain('jangan mengklaim skill sudah dipasang');
  });

  it('menolak argumen tidak valid tanpa memanggil server', async () => {
    const out = await executeAssignSkillTool(call('assign_skill', { bot_id: 'budi', skill: '' }));
    expect(out).toContain('Skill tidak dipasang:');
    expect(mockAssignSkill).not.toHaveBeenCalled();
  });
});

describe('executeSkillTool (dispatcher)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('merutekan create_skill, list_skills, dan assign_skill, menolak nama tak dikenal', async () => {
    mockCreateSkill.mockResolvedValue({ skill: SKILL, warnings: [] });
    expect(
      await executeSkillTool(
        call('create_skill', { name: 'meeting-notes', description: 'Writes short meeting notes.', body: 'Write notes.' }),
      ),
    ).toContain('Skill dibuat:');
    mockGetSkills.mockResolvedValue([SKILL]);
    expect(await executeSkillTool(call('list_skills', { scope: 'shelf' }))).toContain('Skill di rak (1):');
    mockAssignSkill.mockResolvedValue({
      character: { name: 'Budi', skills: ['meeting-notes'] },
      changed: true,
      note: "skill 'meeting-notes' assigned",
    });
    expect(
      await executeSkillTool(call('assign_skill', { bot_id: 'budi', skill: 'meeting-notes' })),
    ).toContain('dipasang ke bot Budi');
    expect(await executeSkillTool(call('hapus_skill', { skill: 'meeting-notes' }))).toBe(
      'Tool itu tidak dikenal di aplikasi ini.',
    );
  });
});
