import { NextResponse } from "next/server";

import { createChatThread, listChatThreads } from "@/lib/chat-store";
import { normalizeMode } from "@/lib/horse";

export const runtime = "nodejs";

export async function GET() {
  try {
    const threads = await listChatThreads();

    return NextResponse.json({ threads });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load chats.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: unknown;
      starterLine?: unknown;
    };
    const mode = normalizeMode(body.mode);
    const starterLine =
      typeof body.starterLine === "string" && body.starterLine.trim()
        ? body.starterLine.trim()
        : mode === "unicorn"
          ? "Which rainbow should we chase?"
          : "Where should we gallop?";

    const thread = await createChatThread({ mode, starterLine });

    return NextResponse.json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create a chat.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
