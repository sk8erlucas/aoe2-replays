import type { ParserError, ReplayData } from "@aoe2-replays/shared";

const PARSER_URL = process.env.PARSER_URL ?? "http://127.0.0.1:8000";
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export type ParseResult =
  | { ok: true; data: ReplayData; raw: string }
  | { ok: false; status: number; code: string; message: string };

/** Sends a replay to the parser service. `raw` is the JSON exactly as returned. */
export async function parseReplay(file: Blob): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file, "replay.aoe2record");
  let res: Response;
  try {
    res = await fetch(`${PARSER_URL}/parse`, { method: "POST", body: form });
  } catch {
    return { ok: false, status: 502, code: "parser_unavailable", message: "The parser service is not responding." };
  }
  const raw = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, status: 502, code: "parser_error", message: "Invalid response from the parser." };
  }
  if (!res.ok) {
    const err = (json as ParserError).error ?? { code: "parser_error", message: `HTTP ${res.status}` };
    return { ok: false, status: res.status, code: err.code, message: err.message };
  }
  return { ok: true, data: json as ReplayData, raw };
}
