import { NextResponse } from "next/server";

import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const client = getOpenAIClient();

    if (!client) {
      return NextResponse.json(
        { error: "OPENAI_KEY is not configured." },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "An audio file is required." },
        { status: 400 },
      );
    }

    if (!audio.size || audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio must be smaller than 8MB." },
        { status: 400 },
      );
    }

    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
    });

    return NextResponse.json({ text: transcription.text.trim() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to transcribe audio.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
