import { NextResponse } from "next/server";

import {
  buildModelInput,
  evaluateGuardrails,
  finalizeAssistantMessage,
  getSystemPrompt,
  normalizeMode,
  normalizeMessages,
} from "@/lib/horse";
import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

type StreamPayload =
  | { type: "delta"; delta: string }
  | { type: "final"; content: string }
  | { type: "notice"; notice: string }
  | { type: "error"; error: string };

const STREAM_HEADERS = {
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "X-Accel-Buffering": "no",
} as const;

function createStreamResponse(producer: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void> | void) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const push = (payload: StreamPayload) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        void (async () => {
          try {
            await producer({
              enqueue(chunk) {
                controller.enqueue(chunk);
              },
              close() {
                controller.close();
              },
              error(reason) {
                controller.error(reason);
              },
            } as ReadableStreamDefaultController<Uint8Array>);
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Unable to complete the request.";

            push({ type: "error", error: message });
            controller.close();
          }
        })();
      },
    }),
    { headers: STREAM_HEADERS },
  );
}

function pushPayload(
  controller: ReadableStreamDefaultController<Uint8Array>,
  payload: StreamPayload,
) {
  const encoder = new TextEncoder();

  controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: unknown; mode?: unknown };
    const messages = normalizeMessages(body.messages);
    const mode = normalizeMode(body.mode);
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
      return createStreamResponse(async (controller) => {
        pushPayload(controller, {
          type: "final",
          content: finalizeAssistantMessage(guardrailResult.content, mode),
        });
        pushPayload(controller, {
          type: "notice",
          notice: `Guardrail: ${guardrailResult.reason.replaceAll("_", " ")}`,
        });
        controller.close();
      });
    }

    const client = getOpenAIClient();

    if (!client) {
      return NextResponse.json(
        { error: "OPENAI_KEY is not configured." },
        { status: 503 },
      );
    }

    return createStreamResponse(async (controller) => {
      const responseStream = client.responses.stream(
        {
          model: process.env.OPENAI_MODEL ?? "gpt-4.1-nano",
          instructions: getSystemPrompt(mode),
          input: buildModelInput(messages),
          max_output_tokens: 140,
        },
        { signal: request.signal },
      );
      let rawText = "";
      let finalText = "";

      for await (const event of responseStream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          rawText += event.delta;
          pushPayload(controller, { type: "delta", delta: event.delta });
        }

        if (event.type === "response.output_text.done") {
          finalText = event.text;
        }
      }

      const finalResponse = await responseStream.finalResponse();
      const sourceText =
        finalText.trim() || finalResponse.output_text?.trim() || rawText.trim();

      pushPayload(controller, {
        type: "final",
        content: finalizeAssistantMessage(sourceText, mode),
      });
      controller.close();
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to complete the request.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
