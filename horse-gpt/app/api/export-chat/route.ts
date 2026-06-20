import { NextResponse } from "next/server";

import {
  buildChatPdf,
  emailChatPdf,
  getPdfFileName,
} from "@/lib/chat-export";
import { normalizeMode, normalizeMessages } from "@/lib/horse";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      messages?: unknown;
      mode?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const messages = normalizeMessages(body.messages);
    const mode = normalizeMode(body.mode);

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "There is no conversation to export." },
        { status: 400 },
      );
    }

    const pdfBytes = await buildChatPdf(messages, mode);
    const mailResult = await emailChatPdf({ email, pdfBytes, mode });

    return NextResponse.json({
      fileName: getPdfFileName(mode),
      pdfBase64: pdfBytes.toString("base64"),
      sent: mailResult.sent,
      error: mailResult.sent ? undefined : mailResult.error,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to export the chat.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
