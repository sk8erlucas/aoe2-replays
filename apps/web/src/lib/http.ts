import { NextResponse } from "next/server";

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Runs a route handler and turns unexpected failures (database down, etc.) into a clear 503. */
export async function withErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    console.error(err);
    return apiError(503, "unavailable", "El servicio no está disponible en este momento. Probá en un rato.");
  }
}
