// POST: upload a .aoe2record. It is parsed, and only the resulting JSON is stored.
import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { MAX_UPLOAD_BYTES, parseReplay } from "@/lib/parser";
import { createReplay, deleteExpired, hashIp, uploadLimitReached, uploadsLastHour } from "@/lib/replays";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "bad_request", "Se esperaba un formulario con el archivo.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "bad_request", "Falta el archivo.");
  if (file.size > MAX_UPLOAD_BYTES) return apiError(413, "too_large", "El archivo supera los 30 MB.");
  if (!file.name.toLowerCase().endsWith(".aoe2record")) {
    return apiError(400, "bad_extension", "El archivo tiene que ser un .aoe2record.");
  }

  const ipHash = hashIp(request);
  if (ipHash && uploadLimitReached(await uploadsLastHour(ipHash))) {
    return apiError(429, "rate_limited", "Subiste muchos replays en la última hora. Probá más tarde.");
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
