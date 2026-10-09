import { parse } from "csv-parse/sync";
import { z, type ZodObject, type ZodRawShape } from "zod";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  let headers: string[] = [];
  try {
    const rows = parse(text, {
      columns: (h: string[]) => (headers = h.map((x) => x.trim())),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
    return { headers, rows };
  } catch (e) {
    throw new Error(`Could not parse CSV: ${(e as Error).message}`);
  }
}

export interface RowError {
  /** 1-based line in the file (the header is line 1). */
  line: number;
  message: string;
}

export interface ValidationResult<T> {
  rows: T[];
  errors: RowError[];
}

/** Header problems are reported once, as line 1. Unknown columns are errors so typos never go silent. */
export function checkHeaders(headers: string[], schema: ZodObject<ZodRawShape>): RowError[] {
  const errors: RowError[] = [];
  const known = Object.keys(schema.shape);
  const required = known.filter((k) => !z.safeParse(schema.shape[k], undefined).success);
  for (const h of headers) {
    if (!known.includes(h)) errors.push({ line: 1, message: `Unknown column "${h}"` });
  }
  for (const r of required) {
    if (!headers.includes(r)) errors.push({ line: 1, message: `Missing required column "${r}"` });
  }
  return errors;
}

export function validateRows<T>(
  parsed: ParsedCsv,
  schema: ZodObject<ZodRawShape>,
): ValidationResult<T> {
  const headerErrors = checkHeaders(parsed.headers, schema);
  if (headerErrors.length) return { rows: [], errors: headerErrors };

  const rows: T[] = [];
  const errors: RowError[] = [];
  parsed.rows.forEach((raw, i) => {
    const res = schema.safeParse(raw);
    if (res.success) rows.push(res.data as T);
    else {
      for (const issue of res.error.issues) {
        errors.push({ line: i + 2, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
      }
    }
  });
  return { rows, errors };
}
