import { createClient } from "@supabase/supabase-js";
import { newToken, TOKEN_PATTERN } from "@/lib/session/store";
import type { ReportData } from "./facts";

/** Reports are addressed by an unguessable access token; the link is the credential. */
export interface ReportStore {
  save(sessionId: string, data: ReportData): Promise<{ token: string }>;
  get(token: string): Promise<ReportData | null>;
}

export class MemoryReportStore implements ReportStore {
  private rows = new Map<string, ReportData>();
  async save(_sessionId: string, data: ReportData) {
    const token = newToken();
    this.rows.set(token, data);
    return { token };
  }
  async get(token: string) {
    return this.rows.get(token) ?? null;
  }
}

export class SupabaseReportStore implements ReportStore {
  private db;
  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  async save(sessionId: string, data: ReportData) {
    const token = newToken();
    const { error } = await this.db.from("reports").insert({ session_id: sessionId, access_token: token, scored_results: data });
    if (error) throw new Error(`Could not save report: ${error.message}`);
    return { token };
  }
  async get(token: string) {
    if (!TOKEN_PATTERN.test(token)) return null;
    const { data, error } = await this.db.from("reports").select("scored_results").eq("access_token", token).maybeSingle();
    if (error) throw new Error(`Could not load report: ${error.message}`);
    return data ? (data.scored_results as ReportData) : null;
  }
}

const g = globalThis as unknown as { __reportStore?: ReportStore };

export function getReportStore(): ReportStore {
  if (!g.__reportStore) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    g.__reportStore = url && key ? new SupabaseReportStore(url, key) : new MemoryReportStore();
  }
  return g.__reportStore;
}
