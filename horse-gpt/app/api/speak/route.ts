import { NextResponse } from "next/server";

import { getOpenAIClient } from "@/lib/openai";
import { normalizeMode, normalizePersona } from "@/lib/horse";

export const runtime = "nodejs";

const MAX_TTS_CHARS = 2500;

// The horse's ElevenLabs voice. Overridable via env, but defaults to this id
// so TTS works without extra configuration.
const DEFAULT_ELEVENLABS_VOICE_ID = "EAbChaVRdtypK7csJZMT";

async function createSpeechResponse(inputText: unknown, inputMode: unknown) {
  try {
    const text =
      typeof inputText === "string" ? inputText.trim().slice(0, MAX_TTS_CHARS) : "";
    const mode = normalizeMode(inputMode);
    const persona =
      mode === "unicorn" ? "normal" : normalizePersona(process.env.PERSONA);

    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    const elevenKey = process.env.ELEVENLABS_API_KEY ?? "";
    const voiceId =
      process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID;

    // Prefer ElevenLabs when configured.
    if (elevenKey && voiceId) {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings:
              mode === "unicorn"
                ? {
                    stability: 0.36,
                    similarity_boost: 0.9,
                    style: 0.72,
                    use_speaker_boost: true,
                    speed: 1.12,
                  }
                : persona === "unhinged"
                ? {
                    stability: 0.1,
                    similarity_boost: 0.82,
                    style: 1.0,
                    use_speaker_boost: true,
                    speed: 1.24,
                  }
                : {
                    stability: 0.28,
                    similarity_boost: 0.88,
                    style: 0.82,
                    use_speaker_boost: true,
                    speed: 1.15,
                  },
          }),
        },
      );

      if (response.ok && response.body) {
        return new Response(response.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      }

      // Fall through to OpenAI TTS if ElevenLabs failed.
    }

    const client = getOpenAIClient();

    if (!client) {
      return NextResponse.json(
        { error: "No TTS provider configured (set ELEVENLABS_API_KEY or OPENAI_KEY)." },
        { status: 503 },
      );
    }

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

export async function GET(request: Request) {
  const url = new URL(request.url);

  return createSpeechResponse(
    url.searchParams.get("text"),
    url.searchParams.get("mode"),
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: unknown; mode?: unknown };

  return createSpeechResponse(body.text, body.mode);
}
