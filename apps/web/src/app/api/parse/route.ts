// Forwards an uploaded replay to the parser service and returns its JSON.
// Nothing is stored yet: the replay lives only in the browser that uploaded it.

import { NextResponse } from "next/server";

const PARSER_URL = process.env.PARSER_URL ?? "http://127.0.0.1:8000";
const MAX_BYTES = 30 * 1024 * 1024;

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "bad_request", "Se esperaba un formulario con el archivo.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return error(400, "bad_request", "Falta el archivo.");
  if (file.size > MAX_BYTES) return error(413, "too_large", "El archivo supera los 30 MB.");
  if (!file.name.toLowerCase().endsWith(".aoe2record")) {
    return error(400, "bad_extension", "El archivo tiene que ser un .aoe2record.");
  }

  const upstream = new FormData();
  upstream.append("file", file, "replay.aoe2record");
  let res: Response;
  try {
    res = await fetch(`${PARSER_URL}/parse`, { method: "POST", body: upstream });
  } catch {
    return error(502, "parser_unavailable", "El servicio de parseo no responde. ¿Está corriendo?");
  }
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
