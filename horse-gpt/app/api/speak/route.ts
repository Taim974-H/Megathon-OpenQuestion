import { NextResponse } from "next/server";

import { getOpenAIClient } from "@/lib/openai";
import { normalizeMode } from "@/lib/horse";

export const runtime = "nodejs";

const MAX_TTS_CHARS = 1200;

export async function POST(request: Request) {
  try {
    const client = getOpenAIClient();

    if (!client) {
      return NextResponse.json(
        { error: "OPENAI_KEY is not configured." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { text?: unknown; mode?: unknown };
    const text =
      typeof body.text === "string" ? body.text.trim().slice(0, MAX_TTS_CHARS) : "";
    const mode = normalizeMode(body.mode);

    if (!text) {
      return NextResponse.json(
        { error: "Text is required." },
        { status: 400 },
      );
    }

    // A brighter voice for unicorn mode, a grounded one for horse mode.
    const voice =
      process.env.OPENAI_TTS_VOICE ?? (mode === "unicorn" ? "nova" : "onyx");

    const speech = await client.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to synthesize speech.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
