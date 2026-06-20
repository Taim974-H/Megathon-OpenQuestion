import { NextResponse } from "next/server";

import { deleteChatThread, updateChatThread } from "@/lib/chat-store";
import { normalizeMode, normalizeMessages } from "@/lib/horse";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const deleted = await deleteChatThread(id);

    if (!deleted) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete the chat.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      title?: unknown;
      starterLine?: unknown;
      mode?: unknown;
      messages?: unknown;
    };
    const thread = await updateChatThread(id, {
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : undefined,
      starterLine:
        typeof body.starterLine === "string" && body.starterLine.trim()
          ? body.starterLine.trim()
          : undefined,
      mode: body.mode === undefined ? undefined : normalizeMode(body.mode),
      messages:
        body.messages === undefined ? undefined : normalizeMessages(body.messages),
    });

    if (!thread) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update the chat.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
