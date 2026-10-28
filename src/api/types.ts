/**
 * Shared types for the own-build server API and the BYO-API model call.
 *
 * Shapes are taken from the Python server in ../app/server.py (and
 * ../app/chat_store.py / ../costs/ledger.py) — see the notes on each
 * type. Nothing here carries a credential: the BYO credential lives
 * only in secure storage and is sent only to the model provider.
 */

/** One bot (character file) as returned by GET /api/characters. */
export interface Character {
  /** File stem, e.g. "chief". */
  id: string;
  name: string;
  role: string;
  skills: string[];
  /** Extra tool names, when the server reports them. */
  tools?: string[];
  /** "private" | "team" (or another scope string). */
  memory_scope: string;
  status?: string;
  errors?: string[];
  /** Optional short description; the server does not send one today. */
  summary?: string;
  /**
   * Isi SOUL karakter (instruksi berdiri, pola referensi) — teks bebas
   * per bot, bila server mengirimkannya (parent: characters/ +
   * GET /api/characters). Bila tidak ada, builder memakai perilaku
   * 0.9.8 (nama/role/skills) supaya tidak rusak.
   */
  soul?: string;
}

/** One skill folder on the shelf as returned by GET /api/skills. */
export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  status: string;
  errors?: string[];
}

/** Presence event attached to a message (e.g. a "stopped" note). */
export interface PresenceEvent {
  type: string;
  character?: string;
  text?: string;
  note?: string;
  [key: string]: unknown;
}

/** One stored chat message as returned by GET /api/chat. */
export interface ChatMessage {
  id: number;
  room: string;
  /** Bot stem for assistant messages; null for system messages. */
  character: string | null;
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** ISO-8601 UTC timestamp, e.g. "2026-10-25T07:00:00Z". */
  created_at: string;
  presence?: PresenceEvent[];
}

/**
 * One room as returned by GET /api/rooms.
 *
 * NOTE: the server field is `mode` ("chat" | "meeting" | "space"),
 * not `kind`. Meeting rooms additionally carry `budget`,
 * `budget_remaining` and `next_speaker`. Space rooms are named
 * workspaces that group bots (0.10.0): same room shape as a group,
 * but shown distinctly and meant for organising bots by topic.
 */
export interface Room {
  id: string;
  name: string;
  mode: 'chat' | 'meeting' | 'space';
  members: string[];
  decisions?: Array<{ decision: string; disputed?: string; created_at: string }>;
  disputed?: Array<{ point: string; created_at: string }>;
  stopped?: boolean;
  message_count?: number;
  budget?: number;
  budget_remaining?: number;
  next_speaker?: string | null;
}

/** One stored memory row as returned by GET /api/memory. */
export interface MemoryEntry {
  id: number;
  scope: string;
  author: string;
  text: string;
  created_at: string;
  superseded_by?: number | null;
}

/**
 * BYO-API configuration. Stored ONLY in expo-secure-store under the
 * key "grokbot_byo" and sent ONLY as `Authorization: Bearer <credential>`
 * to the model provider's own base URL. It is never sent to the local
 * server, and no server endpoint accepts it.
 */
export interface ByoConfig {
  /** Model provider base URL, no trailing slash, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  /** Model name, e.g. "gpt-4o-mini". */
  model: string;
  /** Provider credential (API key). Never logged, never sent to the server. */
  credential: string;
}

/** Token usage as reported by a model provider. */
export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

/**
 * Daily-cap gate result from GET /api/costs/cap-check.
 * `allowed` is false exactly when a cap is set and today's estimated
 * spend has reached it. `cap_usd` / `remaining_usd` are null when the
 * bot has no cap (unlimited).
 */
export interface CapCheck {
  bot: string;
  day: string;
  cap_usd: number | null;
  spent_usd: number;
  remaining_usd: number | null;
  allowed: boolean;
  message: string;
}

/** Health report from GET /api/health. */
export interface HealthReport {
  /**
   * "ok" | "warn" | "bad". NOTE: the server field is `level`, not
   * `status`.
   */
  level: 'ok' | 'warn' | 'bad';
  reasons: string[];
  checks: Record<string, { ok: boolean; severity: 'core' | 'optional'; detail: string }>;
  uptime_seconds: number | null;
  version: string;
}

/** Response of POST /api/chat (mock reply path). */
export interface MockChatResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  presence: PresenceEvent[];
  /** Model label, e.g. "MOCK". */
  model: string;
}

/** Response of POST /api/messages (persist path). */
export interface PersistMessageResponse {
  message: ChatMessage;
  breaker?: { allowed: boolean; reason: string; escalate: boolean };
}

/** Response of POST /api/memory. */
export interface SaveMemoryResponse {
  character: string;
  ids: Record<string, number>;
  scopes: string[];
}

/** One ledger record as returned by POST /api/costs/record. */
export interface CostRecord {
  bot: string;
  task_id?: string;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  task_kind?: string;
  day?: string;
  cost_usd?: number;
  [key: string]: unknown;
}

/** Error thrown for non-2xx server responses (other than 401). */
export class ApiError extends Error {
  readonly status: number;
  readonly serverMessage?: string;

  constructor(status: number, message: string, serverMessage?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}
