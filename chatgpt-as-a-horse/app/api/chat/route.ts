import { NextResponse } from "next/server";

import {
  HORSE_SYSTEM_PROMPT,
  buildModelInput,
  evaluateGuardrails,
  finalizeAssistantMessage,
  normalizeMessages,
} from "@/lib/horse";
import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: unknown };
    const messages = normalizeMessages(body.messages);
    const latestUserMessage = [...messages].reverse().find(
      (message) => message.role === "user",
    );

    if (!latestUserMessage) {
      return NextResponse.json(
        { error: "A user message is required." },
        { status: 400 },
      );
    }

    const guardrailResult = evaluateGuardrails(latestUserMessage.content);

    if (guardrailResult.blocked) {
      return NextResponse.json({
        message: { role: "assistant", content: guardrailResult.content },
        blocked: true,
        reason: guardrailResult.reason,
      });
    }

    const client = getOpenAIClient();

    if (!client) {
      return NextResponse.json(
        { error: "OPENAI_KEY is not configured." },
        { status: 503 },
      );
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      instructions: HORSE_SYSTEM_PROMPT,
      input: buildModelInput(messages),
      max_output_tokens: 280,
    });

    const content = finalizeAssistantMessage(response.output_text);

    return NextResponse.json({
      message: { role: "assistant", content },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to complete the request.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
