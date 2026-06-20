import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_KEY ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  client ??= new OpenAI({ apiKey });
  return client;
}
