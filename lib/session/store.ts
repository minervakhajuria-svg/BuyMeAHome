import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { buyerProfile, type BuyerProfile } from "@/lib/schemas";

/** Sessions are addressed by an unguessable resume token. Anyone holding the link can resume. */
export interface SessionRecord {
  /** Database id (a uuid in Supabase; equal to the token in memory). Needed to link reports. */
  id: string;
  token: string;
  profile: BuyerProfile;
}

export interface SessionStore {
  create(profile: BuyerProfile): Promise<SessionRecord>;
  get(token: string): Promise<SessionRecord | null>;
  save(token: string, profile: BuyerProfile): Promise<void>;
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const newToken = () => randomBytes(16).toString("base64url");

export class MemorySessionStore implements SessionStore {
  private rows = new Map<string, BuyerProfile>();
  async create(profile: BuyerProfile) {
    const token = newToken();
    this.rows.set(token, profile);
    return { id: token, token, profile };
  }
  async get(token: string) {
    const profile = this.rows.get(token);
    return profile ? { id: token, token, profile } : null;
  }
  async save(token: string, profile: BuyerProfile) {
    if (!this.rows.has(token)) throw new Error("Unknown session");
    this.rows.set(token, profile);
  }
}

export class SupabaseSessionStore implements SessionStore {
  private db;
  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  async create(profile: BuyerProfile) {
    const token = newToken();
    const { data, error } = await this.db.from("sessions").insert({ resume_token: token, profile }).select("id").single();
    if (error) throw new Error(`Could not create session: ${error.message}`);
    return { id: data.id as string, token, profile };
  }
  async get(token: string) {
    const { data, error } = await this.db.from("sessions").select("id, profile").eq("resume_token", token).maybeSingle();
    if (error) throw new Error(`Could not load session: ${error.message}`);
    if (!data) return null;
    const parsed = buyerProfile.safeParse(data.profile);
    return { id: data.id as string, token, profile: parsed.success ? parsed.data : buyerProfile.parse({}) };
  }
  async save(token: string, profile: BuyerProfile) {
    const { error } = await this.db.from("sessions").update({ profile }).eq("resume_token", token);
    if (error) throw new Error(`Could not save session: ${error.message}`);
  }
}

const g = globalThis as unknown as { __sessionStore?: SessionStore };

/** Supabase when configured; otherwise an in-memory store that is lost on restart (local dev only). */
export function getStore(): SessionStore {
  if (!g.__sessionStore) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) g.__sessionStore = new SupabaseSessionStore(url, key);
    else {
      console.warn("Supabase is not configured: using an in-memory session store (resume links reset on restart).");
      g.__sessionStore = new MemorySessionStore();
    }
  }
  return g.__sessionStore;
}
