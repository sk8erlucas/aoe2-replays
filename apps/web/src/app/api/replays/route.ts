// POST: upload a .aoe2record. It is parsed, and only the resulting JSON is stored.
import { NextResponse } from "next/server";
import { apiError, withErrors } from "@/lib/http";
import { MAX_UPLOAD_BYTES, parseReplay } from "@/lib/parser";
import { createReplay, deleteExpired, hashIp, uploadLimitReached, uploadsLastHour } from "@/lib/replays";

// Room for the multipart boundaries and the other form fields.
const FORM_OVERHEAD = 64 * 1024;

export async function POST(request: Request) {
  return withErrors(() => upload(request));
}

async function upload(request: Request) {
  // Checked before reading the form, which Next keeps in memory. Bodies without
  // a length (chunked) are still caught by the file size check below.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + FORM_OVERHEAD) return apiError(413, "too_large", "The file is larger than 30 MB.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "bad_request", "Expected a form with the file.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "bad_request", "Missing file.");
  if (file.size > MAX_UPLOAD_BYTES) return apiError(413, "too_large", "The file is larger than 30 MB.");
  if (!file.name.toLowerCase().endsWith(".aoe2record")) {
    return apiError(400, "bad_extension", "The file must be an .aoe2record.");
  }

  const ipHash = hashIp(request);
  if (ipHash && uploadLimitReached(await uploadsLastHour(ipHash))) {
    return apiError(429, "rate_limited", "Too many uploads in the last hour. Try again later.");
  }

  const parsed = await parseReplay(file);
  if (!parsed.ok) return apiError(parsed.status, parsed.code, parsed.message);

  await deleteExpired();
  const { id, token } = await createReplay(parsed.data, parsed.raw, file.name, ipHash);
  return NextResponse.json(
    { id, token, mapName: parsed.data.map.name, durationMs: parsed.data.game.duration_ms },
    { status: 201 },
  );
}
