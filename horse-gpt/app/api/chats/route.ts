import { NextResponse } from "next/server";

import {
  createChatThread,
  listChatThreads,
  updateAllChatThreadsMode,
} from "@/lib/chat-store";
import { getStarterLines } from "@/lib/chat-config";
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

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: unknown;
    };
    const mode = normalizeMode(body.mode);
    const starterLines = getStarterLines(mode);
    const threads = await updateAllChatThreadsMode({
      mode,
      createStarterLine: () =>
        starterLines[Math.floor(Math.random() * starterLines.length)],
    });

    return NextResponse.json({ threads });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update chat mode.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
